"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bookingStayEvents,
  checkinCheckoutRequests,
} from "@/lib/db/schema/availability";
import { bookings } from "@/lib/db/schema/bookings";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  createCheckinCheckoutRequestSchema,
  expectedCheckoutTimeSchema,
  reviewCheckinCheckoutRequestSchema,
} from "@/features/availability/schema";
import { canTransitionRequestStatus } from "./transitions";
import type { ActionResult } from "@/features/projects/actions";

export async function updateExpectedCheckoutTimeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("front_office.write");
  const parsed = expectedCheckoutTimeSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Tenant scope: a foreign bookingId must 404 before we write a stay event.
  const [booking] = await db
    .select({ id: bookings.id, organizationId: bookings.organizationId })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, parsed.data.bookingId),
        eq(bookings.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!booking) return { ok: false, error: "Booking not found." };

  const at = new Date(parsed.data.expectedCheckoutAt);
  await db.insert(bookingStayEvents).values({
    organizationId,
    bookingId: parsed.data.bookingId,
    eventType: "expected_checkout_updated",
    eventAt: at,
    notes: parsed.data.notes ?? null,
    createdBy: me?.id ?? null,
  });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "front_office.expected_checkout.update",
    entityType: "booking",
    entityId: parsed.data.bookingId,
    after: { expectedCheckoutAt: at.toISOString() },
  });

  revalidatePath("/dashboard/front-office");
  revalidatePath("/dashboard/front-office/departures");
  return { ok: true };
}

export async function createCheckinCheckoutRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { requestId?: string }> {
  await requirePermission("front_office.write");
  const raw = Object.fromEntries(formData.entries());
  const normalised = {
    ...raw,
    villaId: raw.villaId || null,
    requestedTime: raw.requestedTime || null,
    feeAmountMinor: raw.feeAmountMinor
      ? Number(raw.feeAmountMinor)
      : null,
    currency: raw.currency || null,
    guestMessage: raw.guestMessage || null,
  };
  const parsed = createCheckinCheckoutRequestSchema.safeParse(normalised);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Tenant scope: parent booking must belong to the caller's org, else 404
  // before any request row is minted. Child row inherits the verified org.
  const [parent] = await db
    .select({ organizationId: bookings.organizationId })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, parsed.data.bookingId),
        eq(bookings.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!parent) return { ok: false, error: "Booking not found." };

  const [row] = await db
    .insert(checkinCheckoutRequests)
    .values({
      organizationId,
      bookingId: parsed.data.bookingId,
      villaId: parsed.data.villaId ?? null,
      requestType: parsed.data.requestType,
      requestedTime: parsed.data.requestedTime
        ? new Date(parsed.data.requestedTime)
        : null,
      status: "requested",
      feeAmountMinor: parsed.data.feeAmountMinor ?? null,
      currency: parsed.data.currency ?? null,
      guestMessage: parsed.data.guestMessage ?? null,
      createdBy: me?.id ?? null,
    })
    .returning({ id: checkinCheckoutRequests.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "front_office.request.create",
    entityType: "checkin_checkout_request",
    entityId: row!.id,
    after: {
      bookingId: parsed.data.bookingId,
      requestType: parsed.data.requestType,
    },
  });

  revalidatePath("/dashboard/front-office");
  revalidatePath("/dashboard/front-office/requests");
  return { ok: true, requestId: row!.id };
}

export async function reviewCheckinCheckoutRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("front_office.write");
  const raw = Object.fromEntries(formData.entries());
  const parsed = reviewCheckinCheckoutRequestSchema.safeParse({
    ...raw,
    adminNotes: raw.adminNotes || null,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Tenant scope: a foreign request id must 404 before any decision (which can
  // carry a fee) is applied. Org is ANDed into both the load and the UPDATE so
  // a TOCTOU race can't slip a cross-org row through.
  const [before] = await db
    .select()
    .from(checkinCheckoutRequests)
    .where(
      and(
        eq(checkinCheckoutRequests.id, parsed.data.id),
        eq(checkinCheckoutRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Request not found." };

  if (!canTransitionRequestStatus(before.status, parsed.data.decision)) {
    return {
      ok: false,
      error: `Cannot transition from ${before.status} to ${parsed.data.decision}.`,
    };
  }

  await db
    .update(checkinCheckoutRequests)
    .set({
      status: parsed.data.decision,
      adminNotes: parsed.data.adminNotes ?? before.adminNotes,
      reviewedBy: me?.id ?? null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(checkinCheckoutRequests.id, parsed.data.id),
        eq(checkinCheckoutRequests.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `front_office.request.${parsed.data.decision}`,
    entityType: "checkin_checkout_request",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: parsed.data.decision },
  });

  revalidatePath("/dashboard/front-office/requests");
  return { ok: true };
}
