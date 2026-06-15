"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestStayTokens,
  smartLockAccessCodes,
} from "@/lib/db/schema/guest-stays";
import { bookings } from "@/lib/db/schema/bookings";
import { serviceRequests } from "@/lib/db/schema/operations";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { queueNotification } from "@/features/notifications/services";
import { buildServiceRequestCode } from "@/features/operations/codes";
import { nextDailyCounter } from "@/features/operations/services";
import {
  createGuestServiceRequestSchema,
  issueGuestStayTokenSchema,
  revokeGuestStayTokenSchema,
} from "./schema";
import {
  defaultStayTokenExpiresAt,
  generateStayToken,
  hashStayToken,
  tokenPrefixFromToken,
} from "./token";
import { recordStayAccessEvent } from "./access-log";
import { getStayByToken } from "./services";
import {
  createOrGetStubSmartLockCode,
  revokeStubSmartLockCode,
} from "./smart-lock-stub";
import type { ActionResult } from "@/features/projects/actions";

// -----------------------------------------------------------------------------
// Token issue + revoke
// -----------------------------------------------------------------------------

/**
 * Issue a fresh guest-stay token for a booking. Returns the **raw** token
 * exactly once — never persisted in plaintext, never logged. UI shows
 * the resulting URL to the operator immediately and clears it on
 * navigation.
 */
export async function issueGuestStayTokenAction(
  _prev: (ActionResult & { token?: string; tokenId?: string }) | null,
  formData: FormData,
): Promise<ActionResult & { token?: string; tokenId?: string; expiresAt?: string }> {
  await requirePermission("guest_stay.token.manage");
  const raw = Object.fromEntries(formData.entries());
  const parsed = issueGuestStayTokenSchema.safeParse({
    bookingId: raw.bookingId,
    issuedToEmail: raw.issuedToEmail || null,
    issuedToPhone: raw.issuedToPhone || null,
    expiresAt: raw.expiresAt || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Tenancy guard: only resolve the booking inside the caller's org. A
  // cross-org booking id must be indistinguishable from a missing one.
  const [booking] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.id, parsed.data.bookingId),
        eq(bookings.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!booking) return { ok: false, error: "Booking not found." };

  const token = generateStayToken();
  const tokenHash = hashStayToken(token);
  const tokenPrefix = tokenPrefixFromToken(token);
  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : defaultStayTokenExpiresAt(
        booking.checkOut as unknown as string,
      );

  const [row] = await db
    .insert(guestStayTokens)
    .values({
      organizationId,
      bookingId: parsed.data.bookingId,
      tokenHash,
      tokenPrefix,
      status: "active",
      issuedToEmail: parsed.data.issuedToEmail ?? null,
      issuedToPhone: parsed.data.issuedToPhone ?? null,
      expiresAt,
      createdBy: me?.id ?? null,
    })
    .returning({ id: guestStayTokens.id });

  // Eagerly create the smart-lock stub so operators see something on the
  // booking detail page.
  await createOrGetStubSmartLockCode(parsed.data.bookingId, me?.id ?? null);

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_stay.token.issue",
    entityType: "guest_stay_token",
    entityId: row!.id,
    after: {
      bookingId: parsed.data.bookingId,
      tokenPrefix,
      issuedToEmail: parsed.data.issuedToEmail ?? null,
      expiresAt: expiresAt.toISOString(),
    },
  });

  revalidatePath("/dashboard/guest-stays/tokens");
  revalidatePath(`/dashboard/bookings/${parsed.data.bookingId}/guest-stay`);
  return {
    ok: true,
    token,
    tokenId: row!.id,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function revokeGuestStayTokenAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("guest_stay.token.manage");
  const parsed = revokeGuestStayTokenSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason") || null,
  });
  if (!parsed.success) return { ok: false, error: "Missing token id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Tenancy guard: token row carries organization_id — scope the read so a
  // cross-org token id reads as "not found" rather than leaking state.
  const [before] = await db
    .select()
    .from(guestStayTokens)
    .where(
      and(
        eq(guestStayTokens.id, parsed.data.id),
        eq(guestStayTokens.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Token not found." };
  if (before.status !== "active") {
    return { ok: false, error: `Token is already ${before.status}.` };
  }

  // The UPDATE is ANDed with the org as well so a TOCTOU race can never
  // flip a row outside the caller's tenant.
  await db
    .update(guestStayTokens)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      revokedBy: me?.id ?? null,
      revokeReason: parsed.data.reason ?? null,
    })
    .where(
      and(
        eq(guestStayTokens.id, parsed.data.id),
        eq(guestStayTokens.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_stay.token.revoke",
    entityType: "guest_stay_token",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "revoked", reason: parsed.data.reason ?? null },
  });

  revalidatePath("/dashboard/guest-stays/tokens");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Smart-lock stub revocation (admin-driven)
// -----------------------------------------------------------------------------

export async function revokeSmartLockStubAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("smart_lock.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Tenancy guard: smart_lock_access_codes has no organization_id of its own —
  // its tenant is derived via the parent booking. Resolve the code joined to a
  // booking inside the caller's org so a cross-org code id reads as "not found"
  // and can never be revoked from another tenant.
  const [scoped] = await db
    .select({ id: smartLockAccessCodes.id })
    .from(smartLockAccessCodes)
    .innerJoin(bookings, eq(bookings.id, smartLockAccessCodes.bookingId))
    .where(
      and(
        eq(smartLockAccessCodes.id, id),
        eq(bookings.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!scoped) return { ok: false, error: "Smart-lock code not found." };

  const out = await revokeStubSmartLockCode(id, me?.id ?? null);
  if (!out.ok) return { ok: false, error: out.reason ?? "revoke failed" };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "smart_lock.stub.revoke",
    entityType: "smart_lock_access_code",
    entityId: id,
  });
  revalidatePath("/dashboard/guest-stays/tokens");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Guest service request — token-gated, no admin permission required.
// -----------------------------------------------------------------------------

export async function createGuestServiceRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { requestCode?: string }> {
  // Token gate first; no admin permission check.
  const raw = Object.fromEntries(formData.entries());
  const parsed = createGuestServiceRequestSchema.safeParse({
    token: raw.token,
    category: raw.category,
    title: raw.title,
    description: raw.description || null,
    urgency: raw.urgency || "normal",
    preferredTime: raw.preferredTime || null,
    contactPreference: raw.contactPreference || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const resolved = await getStayByToken(parsed.data.token);
  if (!resolved.ok) {
    await recordStayAccessEvent({
      eventType:
        resolved.reason === "expired"
          ? "expired_token"
          : resolved.reason === "revoked"
            ? "revoked_token"
            : "invalid_token",
    });
    return { ok: false, error: "We couldn't verify your stay link." };
  }
  const stay = resolved.stay;

  const db = getDb();
  if (!db) return { ok: false, error: "Service is temporarily unavailable." };

  const counter = await nextDailyCounter("SR");
  const requestCode = buildServiceRequestCode(counter);

  const [row] = await db
    .insert(serviceRequests)
    .values({
      requestCode,
      villaId: stay.villaId,
      bookingId: stay.bookingId,
      taskId: null,
      requestType: "guest_portal",
      title: parsed.data.title,
      message: parsed.data.description ?? null,
      status: "new",
      priority:
        parsed.data.urgency === "high"
          ? "high"
          : parsed.data.urgency === "low"
            ? "low"
            : "normal",
      preferredTime: parsed.data.preferredTime
        ? new Date(parsed.data.preferredTime)
        : null,
    })
    .returning({ id: serviceRequests.id });

  await recordStayAccessEvent({
    guestStayTokenId: stay.tokenId,
    bookingId: stay.bookingId,
    eventType: "service_request_created",
    metadata: {
      requestCode,
      category: parsed.data.category,
      contactPreference: parsed.data.contactPreference ?? null,
    },
  });

  await recordAuditEvent({
    actorUserId: null,
    action: "guest_stay.service_request.create",
    entityType: "service_request",
    entityId: row!.id,
    after: {
      bookingId: stay.bookingId,
      requestCode,
      category: parsed.data.category,
      urgency: parsed.data.urgency,
    },
  });

  // Notify concierge / property_manager — best-effort.
  try {
    for (const role of ["concierge", "property_manager"]) {
      await queueNotification({
        recipientType: "role",
        organizationId: stay.organizationId,
        channel: "in_app",
        templateKey: "guest_stay.service_request_created",
        title: `Guest service request · ${stay.villaCode ?? "villa"}`,
        body: `${parsed.data.category}: ${parsed.data.title}`,
        payload: {
          recipientRole: role,
          requestCode,
          bookingId: stay.bookingId,
        },
        priority: parsed.data.urgency === "high" ? "high" : "normal",
        dedupeKey: `guest_sr:${row!.id}:${role}`,
      });
    }
  } catch {
    // Non-blocking.
  }

  revalidatePath("/dashboard/operations/service-requests");
  return { ok: true, requestCode };
}
