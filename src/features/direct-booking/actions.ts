"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bookingChannels,
  bookings,
} from "@/lib/db/schema/bookings";
import { directBookingRequests } from "@/lib/db/schema/direct-booking";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  appendRequestEvent,
  getHoldById,
  updateHoldStatus,
  updateRequestStatus,
  upsertGuestByEmail,
} from "./services";
import { getDepositForRequest } from "./deposits";
import { depositAllowsBookingConversion } from "./deposits-pure";
import { queueNotification } from "@/features/notifications/services";
import {
  releaseInternalHoldBlockForDirectHold,
  syncHoldStatusToCalendarBlock,
} from "./availability";
import { holdIsActive } from "./hold-pure";
import {
  notifyRequestApproved,
  notifyRequestConverted,
  notifyRequestRejected,
  notifyRequestUnderReview,
} from "./notifications";
import { syncGuestStatusForChain } from "./guest-status-lifecycle";
import {
  convertRequestSchema,
  decisionSchema,
  holdIdSchema,
  requestIdSchema,
} from "./schema";
import { runBookingAutomationForBooking } from "@/features/booking-automation/services";
import { syncBookingCalendarBlock } from "@/features/availability/services";
import type { ActionResult } from "@/features/projects/actions";

// =============================================================================
// Admin actions
// =============================================================================

export async function markDirectBookingUnderReviewAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.write");
  const parsed = requestIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const updated = await updateRequestStatus(parsed.data.id, "under_review", {
    reviewedBy: me?.id ?? null,
    reviewedAt: new Date(),
  });
  if (!updated) return { ok: false, error: "Request not found." };
  await appendRequestEvent({
    requestId: parsed.data.id,
    eventType: "under_review",
    actorType: "internal",
    actorUserId: me?.id ?? null,
    message: "Marked under review",
  });
  await notifyRequestUnderReview({
    requestId: parsed.data.id,
    requestCode: updated.requestCode,
    organizationId: updated.organizationId,
  });
  await syncGuestStatusForChain({ requestId: parsed.data.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.request.under_review",
    entityType: "direct_booking_request",
    entityId: parsed.data.id,
  });
  revalidatePath(`/dashboard/direct-bookings/requests/${parsed.data.id}`);
  return { ok: true };
}

export async function approveDirectBookingRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.approve");
  const parsed = decisionSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const me = await getCurrentAppUser();
  const updated = await updateRequestStatus(parsed.data.id, "approved", {
    reviewedBy: me?.id ?? null,
    reviewedAt: new Date(),
    decisionNote: parsed.data.decisionNote ?? null,
  });
  if (!updated) return { ok: false, error: "Request not found." };
  await appendRequestEvent({
    requestId: parsed.data.id,
    eventType: "approved",
    actorType: "internal",
    actorUserId: me?.id ?? null,
    message: parsed.data.decisionNote ?? null,
  });
  await notifyRequestApproved({
    requestId: parsed.data.id,
    requestCode: updated.requestCode,
    organizationId: updated.organizationId,
  });
  await syncGuestStatusForChain({ requestId: parsed.data.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.request.approve",
    entityType: "direct_booking_request",
    entityId: parsed.data.id,
    after: { decisionNote: parsed.data.decisionNote ?? null },
  });
  revalidatePath(`/dashboard/direct-bookings/requests/${parsed.data.id}`);
  return { ok: true };
}

export async function rejectDirectBookingRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.approve");
  const parsed = decisionSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const me = await getCurrentAppUser();
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const updated = await updateRequestStatus(parsed.data.id, "rejected", {
    reviewedBy: me?.id ?? null,
    reviewedAt: new Date(),
    decisionNote: parsed.data.decisionNote ?? null,
  });
  if (!updated) return { ok: false, error: "Request not found." };
  // Release the underlying hold + calendar block.
  await updateHoldStatus(updated.holdId, "rejected");
  await releaseInternalHoldBlockForDirectHold(updated.holdId);
  await appendRequestEvent({
    requestId: parsed.data.id,
    eventType: "rejected",
    actorType: "internal",
    actorUserId: me?.id ?? null,
    message: parsed.data.decisionNote ?? null,
  });
  await notifyRequestRejected({
    requestId: parsed.data.id,
    requestCode: updated.requestCode,
    organizationId: updated.organizationId,
  });
  await syncGuestStatusForChain({ requestId: parsed.data.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.request.reject",
    entityType: "direct_booking_request",
    entityId: parsed.data.id,
    after: { decisionNote: parsed.data.decisionNote ?? null },
  });
  revalidatePath(`/dashboard/direct-bookings/requests/${parsed.data.id}`);
  return { ok: true };
}

export async function convertDirectBookingRequestToBookingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { bookingId?: string; bookingCode?: string }> {
  await requirePermission("direct_booking.convert");
  const parsed = convertRequestSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [request] = await db
    .select()
    .from(directBookingRequests)
    .where(eq(directBookingRequests.id, parsed.data.id))
    .limit(1);
  if (!request) return { ok: false, error: "Request not found." };
  if (!["approved", "submitted", "under_review"].includes(request.status)) {
    return {
      ok: false,
      error: `Cannot convert from status ${request.status}.`,
    };
  }
  const hold = await getHoldById(request.holdId);
  if (!hold) return { ok: false, error: "Hold not found." };
  if (
    hold.status !== "active" &&
    hold.status !== "converted"
  ) {
    return { ok: false, error: `Hold is ${hold.status}.` };
  }

  // Prompt 106 — deposit gate.
  const deposit = await getDepositForRequest(request.id);
  const depositPaid =
    deposit != null && depositAllowsBookingConversion(
      deposit.status as Parameters<typeof depositAllowsBookingConversion>[0],
    );
  let effectiveFinalStatus = parsed.data.finalStatus;
  if (!depositPaid) {
    if (!parsed.data.convertWithoutDeposit) {
      return {
        ok: false,
        error: "Deposit is not marked paid yet.",
      };
    }
    // Override path — director / super_admin only.
    try {
      await requirePermission("direct_booking.manage");
    } catch {
      return {
        ok: false,
        error: "Override requires booking_manager / director / super_admin.",
      };
    }
    // Override always lands as tentative (never confirmed).
    effectiveFinalStatus = "tentative";
  }

  // Channel: prefer the explicitly-passed `channelId`, else look up
  // the `direct` channel by key.
  let channelId = parsed.data.channelId ?? null;
  if (!channelId) {
    const [direct] = await db
      .select({ id: bookingChannels.id })
      .from(bookingChannels)
      .where(eq(bookingChannels.key, "direct"))
      .limit(1);
    channelId = direct?.id ?? null;
  }

  // Guest record.
  const guestId =
    request.guestId ??
    (await upsertGuestByEmail({
      email: request.guestEmail,
      fullName: [request.guestFirstName, request.guestLastName ?? ""]
        .filter(Boolean)
        .join(" ")
        .trim(),
      phone: request.guestPhone ?? null,
      nationality: request.guestCountry ?? null,
    }));

  // Booking code.
  const bookingCode = await pickUniqueBookingCode(db, request.requestCode);

  // Money: total stays in the hold's currency / minor units. Persist
  // a major-unit numeric to bookings (legacy schema).
  const totalMinor = hold.totalMinor;
  const grossMajor = (totalMinor / 100n).toString() + "." +
    String(totalMinor % 100n).padStart(2, "0");

  const organizationId = await requireOrgId();
  const [bookingRow] = await db
    .insert(bookings)
    .values({
      organizationId,
      villaId: request.villaId,
      guestId,
      channelId,
      bookingCode,
      sourceReference: request.requestCode,
      status: effectiveFinalStatus,
      checkIn: hold.checkIn,
      checkOut: hold.checkOut,
      nights: hold.nights,
      adults: request.guestCount,
      children: 0,
      currency: hold.currency,
      grossAmount: grossMajor,
      cleaningFeeAmount: "0",
      channelFeeAmount: "0",
      paymentFeeAmount: "0",
      netExpectedAmount: grossMajor,
      notes: request.specialRequests ?? null,
    })
    .returning({ id: bookings.id, bookingCode: bookings.bookingCode });
  if (!bookingRow) {
    return { ok: false, error: "Booking insert failed." };
  }

  // Mark request + hold as converted.
  await updateRequestStatus(parsed.data.id, "converted", {
    bookingId: bookingRow.id,
    guestId,
    reviewedBy: me?.id ?? null,
    reviewedAt: new Date(),
  });
  await updateHoldStatus(hold.id, "converted", {
    convertedBookingId: bookingRow.id,
  });

  await appendRequestEvent({
    requestId: parsed.data.id,
    eventType: "converted_to_booking",
    actorType: "internal",
    actorUserId: me?.id ?? null,
    message: `Converted to booking ${bookingRow.bookingCode}`,
    metadataJson: { bookingId: bookingRow.id },
  });

  // Calendar: release the hold block; create the canonical booking
  // block via the existing helper.
  await releaseInternalHoldBlockForDirectHold(hold.id);
  await syncBookingCalendarBlock(bookingRow.id, me?.id ?? null);

  // Booking automation (best-effort).
  try {
    await runBookingAutomationForBooking(bookingRow.id);
  } catch (e) {
    console.warn("[direct-booking] booking automation failed", e);
  }

  await notifyRequestConverted({
    requestId: parsed.data.id,
    bookingCode: bookingRow.bookingCode,
    organizationId,
  });
  // Notify booking_manager + concierge that the booking is confirmed.
  await queueNotification({
    recipientType: "role",
    organizationId,
    channel: "in_app",
    templateKey: "direct_booking.booking_confirmed",
    title: `Direct booking confirmed — ${bookingRow.bookingCode}`,
    body: `${effectiveFinalStatus === "confirmed" ? "Confirmed" : "Tentative"} booking issued from ${request.requestCode}.`,
    dedupeKey: `direct-booking-confirmed:${bookingRow.id}`,
    payload: {
      bookingId: bookingRow.id,
      bookingCode: bookingRow.bookingCode,
      role: "booking_manager",
    },
    priority: "normal",
  });
  await syncGuestStatusForChain({ bookingId: bookingRow.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.request.convert",
    entityType: "direct_booking_request",
    entityId: parsed.data.id,
    after: {
      bookingId: bookingRow.id,
      bookingCode: bookingRow.bookingCode,
      finalStatus: effectiveFinalStatus,
      depositPaid,
      convertWithoutDeposit: parsed.data.convertWithoutDeposit ?? false,
      overrideReason: parsed.data.overrideReason ?? null,
    },
  });

  revalidatePath(`/dashboard/direct-bookings/requests/${parsed.data.id}`);
  revalidatePath(`/dashboard/bookings/${bookingRow.id}`);
  return {
    ok: true,
    bookingId: bookingRow.id,
    bookingCode: bookingRow.bookingCode,
  };
}

export async function cancelDirectBookingHoldAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.write");
  const parsed = holdIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const hold = await getHoldById(parsed.data.id);
  if (!hold) return { ok: false, error: "Hold not found." };
  if (hold.status !== "active") {
    return { ok: false, error: `Hold is ${hold.status}.` };
  }
  if (
    !holdIsActive({
      status: hold.status as Parameters<typeof holdIsActive>[0]["status"],
      expiresAt: hold.expiresAt,
    })
  ) {
    return { ok: false, error: "Hold has expired." };
  }
  await updateHoldStatus(hold.id, "cancelled");
  await releaseInternalHoldBlockForDirectHold(hold.id);
  await syncHoldStatusToCalendarBlock(hold.id);
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.hold.cancel",
    entityType: "direct_booking_hold",
    entityId: hold.id,
  });
  revalidatePath("/dashboard/direct-bookings/holds");
  revalidatePath(`/dashboard/direct-bookings/holds/${hold.id}`);
  return { ok: true };
}

// =============================================================================
// Helpers
// =============================================================================

async function pickUniqueBookingCode(
  db: NonNullable<ReturnType<typeof getDb>>,
  requestCode: string,
): Promise<string> {
  const candidate = `ARC-D-${requestCode.slice(-8).toUpperCase()}`;
  const [existing] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.bookingCode, candidate))
    .limit(1);
  if (!existing) return candidate;
  // Fallback: append a random suffix.
  return `${candidate}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

