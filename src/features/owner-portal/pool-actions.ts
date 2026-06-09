"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  villaPoolState,
  POOL_COOLING_OFF_DAYS,
  type PoolStatus,
} from "@/lib/db/schema/villa-pool-state";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { villas, projects } from "@/lib/db/schema/projects";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { recordAuditEvent } from "@/features/audit/services";
import { requireOwnerWrite } from "@/features/owner-portal/require-owner-write";
import { listMyVillas } from "@/features/owner-portal/owner-portal-queries";
import {
  estimateOwnerStayRequest,
  calculateOwnerStayCharges,
} from "@/features/owner-stays/services";

/**
 * P1 owner-calendar-pool — owner-portal write actions for the interactive
 * pool manager. Unlike the admin owner-stays actions (which gate on the
 * `owner_stay.*` permission), these gate on `requireOwnerWrite()` + an
 * active owner-portal grant, so an authenticated owner self-serves
 * directly from /owner/calendar. Read-only impersonation is refused.
 *
 * Money is never captured here — Indonesia payment rails are deferred.
 * "Pay-&-book" books a chargeable owner-stay request (manual mark-paid
 * happens downstream on the statement); "Book-free" books one that the
 * estimator confirms sits within the free-nights allowance.
 */

export type PoolActionResult = { ok: true } | { ok: false; error: string };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const togglePoolSchema = z.object({
  villaId: z.string().uuid(),
  action: z.enum(["take_out", "return"]),
});

const gridBookSchema = z
  .object({
    villaId: z.string().uuid(),
    requestedStart: date,
    requestedEnd: date,
    mode: z.enum(["pay_and_book", "book_free"]),
    guestsCount: z.coerce.number().int().min(0).max(40).optional().nullable(),
    purpose: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.requestedEnd > d.requestedStart, {
    message: "Check-out must be after check-in.",
    path: ["requestedEnd"],
  });

const cancelStaySchema = z.object({ id: z.string().uuid() });

/** Owner must hold the villa via an active ownership share (scope guard). */
async function ownsVilla(ownerId: string, villaId: string): Promise<boolean> {
  const owned = await listMyVillas(ownerId).catch(() => []);
  return owned.some((v) => v.villaId === villaId);
}

/** Owner self-service requires an active owner-portal grant for the app_user. */
async function hasOwnerGrant(
  appUserId: string | null,
  ownerId: string,
): Promise<boolean> {
  if (!appUserId) return false;
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: appUsersOwners.id })
    .from(appUsersOwners)
    .where(
      and(
        eq(appUsersOwners.appUserId, appUserId),
        eq(appUsersOwners.ownerId, ownerId),
        eq(appUsersOwners.status, "active"),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Take-out-of-pool / return-to-pool toggle with a 14-day cooling-off.
 *
 * The effective `poolStatus` stays put until the cooling-off window
 * elapses; `pendingStatus` + `coolingOffUntil` capture the transition.
 * Re-toggling back to the current effective status simply clears any
 * pending transition (no penalty).
 */
export async function togglePoolStateAction(
  _prev: PoolActionResult | null,
  formData: FormData,
): Promise<PoolActionResult> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = togglePoolSchema.safeParse({
    villaId: formData.get("villaId"),
    action: formData.get("action"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  if (!(await ownsVilla(auth.ownerId, parsed.data.villaId))) {
    return { ok: false, error: "You don't have access to this villa." };
  }

  const target: PoolStatus =
    parsed.data.action === "take_out" ? "out_of_pool" : "in_pool";

  const [existing] = await db
    .select()
    .from(villaPoolState)
    .where(eq(villaPoolState.villaId, parsed.data.villaId))
    .limit(1);

  const currentEffective: PoolStatus =
    existing?.poolStatus === "out_of_pool" ? "out_of_pool" : "in_pool";

  if (currentEffective === target && !existing?.pendingStatus) {
    return {
      ok: false,
      error:
        target === "out_of_pool"
          ? "This villa is already out of the rental pool."
          : "This villa is already in the rental pool.",
    };
  }

  const now = new Date();
  const coolingOffUntil = new Date(
    now.getTime() + POOL_COOLING_OFF_DAYS * 86_400_000,
  );

  if (existing) {
    await db
      .update(villaPoolState)
      .set({
        // Effective status only flips once cooling-off elapses; the read
        // side honours `pendingStatus` + `coolingOffUntil` until then.
        pendingStatus: target,
        coolingOffUntil,
        requestedAt: now,
        changedByAppUserId: auth.appUserId,
        updatedAt: now,
      })
      .where(eq(villaPoolState.villaId, parsed.data.villaId));
  } else {
    await db.insert(villaPoolState).values({
      villaId: parsed.data.villaId,
      poolStatus: currentEffective,
      pendingStatus: target,
      coolingOffUntil,
      requestedAt: now,
      changedByAppUserId: auth.appUserId,
    });
  }

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action:
      target === "out_of_pool"
        ? "owner_portal.pool.take_out"
        : "owner_portal.pool.return",
    entityType: "villa_pool_state",
    entityId: parsed.data.villaId,
    before: { effective: currentEffective },
    after: {
      pendingStatus: target,
      coolingOffUntil: coolingOffUntil.toISOString(),
    },
  });

  revalidatePath("/owner/calendar");
  return { ok: true };
}

/**
 * In-grid Pay-&-book vs Book-free. Reuses the owner-stays estimate /
 * charge pipeline, then inserts an `owner_stay_requests` row — the same
 * persistence the async request-form used, minus the form round-trip.
 *
 * `book_free` is refused when the estimator says the dates fall outside
 * the allowance (i.e. there is a billable charge), nudging the owner to
 * Pay-&-book instead. No money is captured (manual mark-paid downstream).
 */
export async function createOwnerStayFromGridAction(
  _prev: PoolActionResult | null,
  formData: FormData,
): Promise<PoolActionResult & { requestId?: string }> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = gridBookSchema.safeParse({
    villaId: formData.get("villaId"),
    requestedStart: formData.get("requestedStart"),
    requestedEnd: formData.get("requestedEnd"),
    mode: formData.get("mode"),
    guestsCount: formData.get("guestsCount") || null,
    purpose: formData.get("purpose") || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  if (!(await ownsVilla(auth.ownerId, parsed.data.villaId))) {
    return { ok: false, error: "You don't have access to this villa." };
  }
  if (!(await hasOwnerGrant(auth.appUserId, auth.ownerId))) {
    return { ok: false, error: "You don't have an active grant on this owner." };
  }

  const [v] = await db
    .select({
      id: villas.id,
      projectId: villas.projectId,
      organizationId: projects.organizationId,
    })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(eq(villas.id, parsed.data.villaId))
    .limit(1);
  if (!v) return { ok: false, error: "Villa not found." };

  const ctx = await estimateOwnerStayRequest({
    ownerId: auth.ownerId,
    villaId: parsed.data.villaId,
    requestedStart: parsed.data.requestedStart,
    requestedEnd: parsed.data.requestedEnd,
  });
  const charges = calculateOwnerStayCharges(ctx.estimate);

  // Book-free guard: refuse if the estimator says the dates would carry a
  // billable charge (allowance exhausted / peak-excluded). Reuses the
  // existing free-nights allowance — no separate counter.
  if (
    parsed.data.mode === "book_free" &&
    (charges.billableNights > 0 || charges.estimatedTotalOwnerChargeMinor > 0)
  ) {
    return {
      ok: false,
      error:
        "These dates fall outside your free-nights allowance. Use Pay-&-book instead.",
    };
  }

  // Status routing mirrors the admin create action.
  let status = "requested";
  let relocationRequired = false;
  if (ctx.hasGuestBookingConflict) {
    relocationRequired = true;
    status = ctx.policy?.relocationAllowed
      ? "requires_relocation"
      : "pending_admin_approval";
  } else if (ctx.hasAnyConflict) {
    status = "pending_admin_approval";
  } else if (ctx.policy?.requiresApproval) {
    status = "pending_admin_approval";
  }

  const year = Number(parsed.data.requestedStart.slice(0, 4));

  const [row] = await db
    .insert(ownerStayRequests)
    .values({
      organizationId: v.organizationId,
      ownerId: auth.ownerId,
      requestedByAppUserId: auth.appUserId,
      villaId: parsed.data.villaId,
      projectId: v.projectId,
      requestedStart: parsed.data.requestedStart,
      requestedEnd: parsed.data.requestedEnd,
      guestsCount: parsed.data.guestsCount ?? null,
      purpose: parsed.data.purpose ?? null,
      status,
      relocationRequired,
      relocationPossible: relocationRequired ? null : true,
      estimatedGrossRevenueMinor: charges.estimatedGrossRevenueMinor,
      estimatedManagementCompensationMinor:
        charges.estimatedManagementCompensationMinor,
      estimatedOperationalCostMinor: charges.estimatedOperationalCostMinor,
      estimatedTotalOwnerChargeMinor: charges.estimatedTotalOwnerChargeMinor,
      currency: charges.currency,
      allowanceYear: year,
      allowanceNightsApplied: charges.allowanceNightsApplied,
      billableNights: charges.billableNights,
    })
    .returning({ id: ownerStayRequests.id });

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action:
      parsed.data.mode === "book_free"
        ? "owner_portal.stay.book_free"
        : "owner_portal.stay.pay_and_book",
    entityType: "owner_stay_request",
    entityId: row!.id,
    after: {
      ownerId: auth.ownerId,
      villaId: parsed.data.villaId,
      mode: parsed.data.mode,
      status,
      billableNights: charges.billableNights,
      estimatedTotalOwnerChargeMinor: charges.estimatedTotalOwnerChargeMinor,
    },
  });

  revalidatePath("/owner/calendar");
  revalidatePath("/owner/stays");
  return { ok: true, requestId: row!.id };
}

/**
 * Cancel an owner stay straight from the grid. Owner-scoped: only the
 * granted owner of the request's owner_id may cancel, and only while it
 * is still in a cancellable (pre-completion) status.
 */
export async function cancelOwnerStayFromGridAction(
  _prev: PoolActionResult | null,
  formData: FormData,
): Promise<PoolActionResult> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = cancelStaySchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [before] = await db
    .select()
    .from(ownerStayRequests)
    .where(eq(ownerStayRequests.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Stay not found." };

  // Scope: the request must belong to the authenticated owner.
  if (before.ownerId !== auth.ownerId) {
    return { ok: false, error: "You don't have access to this stay." };
  }
  if (!(await hasOwnerGrant(auth.appUserId, before.ownerId))) {
    return { ok: false, error: "You don't have an active grant on this owner." };
  }

  const cancellable = new Set([
    "requested",
    "pending_admin_approval",
    "availability_check",
    "requires_relocation",
    "approved",
    "confirmed",
  ]);
  if (!cancellable.has(before.status)) {
    return { ok: false, error: `Cannot cancel a stay in status ${before.status}.` };
  }

  const now = new Date();
  await db
    .update(ownerStayRequests)
    .set({ status: "cancelled", updatedAt: now })
    .where(eq(ownerStayRequests.id, parsed.data.id));

  // Release the materialised calendar block, if one exists.
  if (before.createdCalendarBlockId) {
    await db
      .update(villaCalendarBlocks)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(villaCalendarBlocks.id, before.createdCalendarBlockId));
  }

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action: "owner_portal.stay.cancel",
    entityType: "owner_stay_request",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "cancelled" },
  });

  revalidatePath("/owner/calendar");
  revalidatePath("/owner/stays");
  return { ok: true };
}
