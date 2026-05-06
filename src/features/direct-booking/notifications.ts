import "server-only";

import { queueNotification } from "@/features/notifications/services";

/**
 * Notification helpers for the direct-booking flow. All calls use a
 * stable dedupe key so retries are safe.
 */

interface InternalNotifyArgs {
  templateKey: string;
  title: string;
  body: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
}

async function notifyRole(
  role: "concierge" | "booking_manager" | "property_manager" | "operations_manager",
  args: InternalNotifyArgs,
): Promise<void> {
  await queueNotification({
    recipientType: "role",
    channel: "in_app",
    templateKey: args.templateKey,
    title: args.title,
    body: args.body,
    dedupeKey: args.dedupeKey,
    payload: { ...(args.payload ?? {}), role },
    priority: args.priority ?? "normal",
  });
}

export async function notifyRequestSubmitted(args: {
  requestId: string;
  requestCode: string;
  villaCode: string | null;
}): Promise<void> {
  await notifyRole("concierge", {
    templateKey: "direct_booking.request_submitted",
    title: `Direct booking request — ${args.villaCode ?? "villa"}`,
    body: `Review ${args.requestCode}.`,
    dedupeKey: `direct-booking-submitted:${args.requestId}`,
    payload: { requestId: args.requestId },
  });
  await notifyRole("booking_manager", {
    templateKey: "direct_booking.request_submitted",
    title: `Direct booking request — ${args.villaCode ?? "villa"}`,
    body: `Review ${args.requestCode}.`,
    dedupeKey: `direct-booking-submitted-bm:${args.requestId}`,
    payload: { requestId: args.requestId },
  });
}

export async function notifyRequestUnderReview(args: {
  requestId: string;
  requestCode: string;
}): Promise<void> {
  await notifyRole("booking_manager", {
    templateKey: "direct_booking.request_under_review",
    title: "Booking request taken",
    body: `${args.requestCode} is under review.`,
    dedupeKey: `direct-booking-under-review:${args.requestId}`,
    payload: { requestId: args.requestId },
  });
}

export async function notifyRequestApproved(args: {
  requestId: string;
  requestCode: string;
}): Promise<void> {
  await notifyRole("booking_manager", {
    templateKey: "direct_booking.request_approved",
    title: "Booking approved",
    body: `${args.requestCode} approved — convert when ready.`,
    dedupeKey: `direct-booking-approved:${args.requestId}`,
    payload: { requestId: args.requestId },
  });
}

export async function notifyRequestRejected(args: {
  requestId: string;
  requestCode: string;
}): Promise<void> {
  await notifyRole("booking_manager", {
    templateKey: "direct_booking.request_rejected",
    title: "Booking rejected",
    body: `${args.requestCode} rejected — guest will be notified.`,
    dedupeKey: `direct-booking-rejected:${args.requestId}`,
    payload: { requestId: args.requestId },
  });
}

export async function notifyRequestConverted(args: {
  requestId: string;
  bookingCode: string;
}): Promise<void> {
  await notifyRole("concierge", {
    templateKey: "direct_booking.request_converted",
    title: `Booking confirmed — ${args.bookingCode}`,
    body: "Direct booking converted from request.",
    dedupeKey: `direct-booking-converted:${args.requestId}`,
    payload: { requestId: args.requestId, bookingCode: args.bookingCode },
  });
}

export async function notifyHoldExpired(args: {
  holdId: string;
  holdCode: string;
}): Promise<void> {
  await notifyRole("concierge", {
    templateKey: "direct_booking.hold_expired",
    title: "Hold expired",
    body: `${args.holdCode} expired without a booking.`,
    dedupeKey: `direct-booking-hold-expired:${args.holdId}`,
    payload: { holdId: args.holdId },
    priority: "low",
  });
}

export async function notifyHoldExpiring(args: {
  holdId: string;
  holdCode: string;
}): Promise<void> {
  await notifyRole("concierge", {
    templateKey: "direct_booking.hold_expiring",
    title: "Hold expiring soon",
    body: `${args.holdCode} expires in <5 minutes.`,
    dedupeKey: `direct-booking-hold-expiring:${args.holdId}`,
    payload: { holdId: args.holdId },
  });
}
