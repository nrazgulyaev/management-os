"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bookingRelocationCandidates,
  ownerStayRequests,
} from "@/lib/db/schema/owner-stays";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  applyRelocationCandidateSchema,
  reviewRelocationCandidateSchema,
} from "./schema";
import {
  applyRelocationCandidate,
  findRelocationCandidates,
} from "./relocation";
import type { ActionResult } from "@/features/projects/actions";

export async function findRelocationCandidatesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { created?: number }> {
  await requirePermission("relocation.manage");
  const id = String(formData.get("ownerStayRequestId") ?? "");
  if (!id) return { ok: false, error: "Missing ownerStayRequestId." };
  const me = await getCurrentAppUser();
  const out = await findRelocationCandidates(id);
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "relocation.candidates.discover",
    entityType: "owner_stay_request",
    entityId: id,
    after: { created: out.created },
  });
  revalidatePath(`/dashboard/owner-stays/requests/${id}`);
  return { ok: true, created: out.created };
}

export async function approveRelocationCandidateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("relocation.manage");
  const parsed = reviewRelocationCandidateSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    decision: formData.get("decision") || "approved",
  });
  if (!parsed.success || parsed.data.decision !== "approved") {
    return { ok: false, error: "Invalid decision." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // TENANCY: bookingRelocationCandidates has no org column; anchor it via its
  // parent owner_stay_request's org. A cross-org candidate id reads as not-found
  // so another org's relocation candidate can't be approved. Mirrors
  // listRelocationCandidates' transitive scope.
  const [candidate] = await db
    .select({ id: bookingRelocationCandidates.id })
    .from(bookingRelocationCandidates)
    .innerJoin(
      ownerStayRequests,
      eq(ownerStayRequests.id, bookingRelocationCandidates.ownerStayRequestId),
    )
    .where(
      and(
        eq(bookingRelocationCandidates.id, parsed.data.id),
        eq(ownerStayRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!candidate) return { ok: false, error: "Candidate not found." };

  await db
    .update(bookingRelocationCandidates)
    .set({
      candidateStatus: "approved",
      approvedBy: me?.id ?? null,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bookingRelocationCandidates.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "relocation.candidate.approve",
    entityType: "booking_relocation_candidate",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/owner-stays");
  return { ok: true };
}

export async function rejectRelocationCandidateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("relocation.manage");
  const parsed = reviewRelocationCandidateSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    decision: formData.get("decision") || "rejected",
  });
  if (!parsed.success || parsed.data.decision !== "rejected") {
    return { ok: false, error: "Invalid decision." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // TENANCY: bookingRelocationCandidates has no org column; anchor it via its
  // parent owner_stay_request's org so a cross-org candidate id reads as
  // not-found and can't be rejected. Mirrors listRelocationCandidates' scope.
  const [candidate] = await db
    .select({ id: bookingRelocationCandidates.id })
    .from(bookingRelocationCandidates)
    .innerJoin(
      ownerStayRequests,
      eq(ownerStayRequests.id, bookingRelocationCandidates.ownerStayRequestId),
    )
    .where(
      and(
        eq(bookingRelocationCandidates.id, parsed.data.id),
        eq(ownerStayRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!candidate) return { ok: false, error: "Candidate not found." };

  await db
    .update(bookingRelocationCandidates)
    .set({
      candidateStatus: "rejected",
      updatedAt: new Date(),
    })
    .where(eq(bookingRelocationCandidates.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "relocation.candidate.reject",
    entityType: "booking_relocation_candidate",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/owner-stays");
  return { ok: true };
}

/**
 * Apply an approved candidate — re-points the booking + re-syncs its
 * calendar block. Atomically validated against live state inside
 * `applyRelocationCandidate`.
 */
export async function applyRelocationCandidateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { bookingId?: string }> {
  await requirePermission("relocation.manage");
  const parsed = applyRelocationCandidateSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Missing candidate id." };
  const me = await getCurrentAppUser();
  const out = await applyRelocationCandidate(parsed.data.id, me?.id ?? null);
  if (!out.ok) return { ok: false, error: out.reason ?? "apply failed" };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "relocation.candidate.apply",
    entityType: "booking_relocation_candidate",
    entityId: parsed.data.id,
    after: { bookingId: out.bookingId, toVillaId: out.toVillaId },
  });
  revalidatePath("/dashboard/owner-stays");
  revalidatePath("/dashboard/availability");
  return { ok: true, bookingId: out.bookingId };
}
