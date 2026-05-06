/**
 * Pure helpers for post-stay review request routing (Prompt 102).
 * No DB / no `server-only` import.
 *
 * Channel routing is deterministic: we pick the review surface that
 * matches the booking's distribution channel. OTA-channel bookings
 * direct the guest to the OTA's own review form (Booking.com /
 * Airbnb send their own emails too — ours is a friendly nudge).
 * Direct bookings go to our internal survey page.
 */

export type ReviewChannel =
  | "direct"
  | "airbnb"
  | "booking_com"
  | "google"
  | "internal_survey"
  | "manual";

export type ReviewRequestStatus =
  | "pending"
  | "sent"
  | "clicked"
  | "completed"
  | "skipped"
  | "failed";

export type ReviewRequestStage =
  | "initial"
  | "reminder_1"
  | "reminder_2"
  | "completed"
  | "skipped";

/**
 * Pure: pick which review surface a booking is routed to.
 * Falls back to internal_survey when the channel is unknown.
 */
export function pickReviewChannelForBooking(
  bookingChannelKey: string | null | undefined,
): ReviewChannel {
  switch ((bookingChannelKey ?? "").toLowerCase()) {
    case "airbnb":
      return "airbnb";
    case "booking":
    case "booking_com":
      return "booking_com";
    case "direct":
      return "internal_survey";
    case "google":
      return "google";
    case "manual":
    case "agent":
    case "":
      return "internal_survey";
    default:
      return "internal_survey";
  }
}

export interface ReviewRequestContext {
  bookingId: string;
  bookingCode: string | null;
  rawToken: string | null;
  externalReference?: string | null;
}

/**
 * Pure: build the URL the review request CTA should open.
 *
 * We deliberately do NOT call OTA APIs — the URL points to the
 * channel's public review surface (Airbnb / Booking.com / Google).
 * For direct/manual stays we route through `/stay/[token]/review`
 * so the survey form lives behind the stay token.
 */
export function buildReviewRequestUrl(
  channel: ReviewChannel,
  ctx: ReviewRequestContext,
): string {
  switch (channel) {
    case "airbnb":
      // The OTA reservation reference, if we have it, becomes a
      // query hint; otherwise we link to the channel home page so
      // the link is never broken.
      return ctx.externalReference
        ? `https://www.airbnb.com/users/show/?reservation=${encodeURIComponent(ctx.externalReference)}`
        : "https://www.airbnb.com/trips";
    case "booking_com":
      return ctx.externalReference
        ? `https://secure.booking.com/myreservations.html?bn=${encodeURIComponent(ctx.externalReference)}`
        : "https://secure.booking.com/myreservations.html";
    case "google":
      return "https://search.google.com/local/writereview";
    case "direct":
    case "internal_survey":
    case "manual":
      return ctx.rawToken
        ? `/stay/${encodeURIComponent(ctx.rawToken)}/review`
        : "#review";
  }
}

/**
 * Pure: a review request is eligible only after the booking has
 * checked out. We use the booking's `check_out` ISO date as the
 * earliest sendable timestamp — ensuring we never email a guest
 * during their stay.
 */
export function shouldRequestReview(
  booking: {
    status: string;
    checkOut: string;
  },
  now: Date,
): boolean {
  if (booking.status === "cancelled") return false;
  if (booking.status === "no_show") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.checkOut)) return false;
  // The check_out date is the day the guest leaves. We allow review
  // requests starting at 14:00 UTC on that day — by then most guests
  // will have left the villa.
  const eligibleAt = new Date(`${booking.checkOut}T14:00:00.000Z`);
  return now.getTime() >= eligibleAt.getTime();
}

/**
 * Pure: friendly subject + body copy per channel. Used to populate
 * notification_queue.title / body when the review-request rule fires.
 */
export function reviewRequestCopy(
  channel: ReviewChannel,
): { title: string; body: string } {
  switch (channel) {
    case "airbnb":
      return {
        title: "Loved your stay? Leave an Airbnb review",
        body: "Airbnb will email you a review form — a quick rating helps your hosts a lot.",
      };
    case "booking_com":
      return {
        title: "Rate your stay on Booking.com",
        body: "Booking.com sends review requests automatically; here's a direct link to yours.",
      };
    case "google":
      return {
        title: "Share a Google review",
        body: "If you have a moment, a Google review really helps the team.",
      };
    case "direct":
    case "internal_survey":
    case "manual":
      return {
        title: "How was your stay?",
        body: "Two questions — under a minute. Your feedback shapes our next month.",
      };
  }
}

/**
 * Pure: deterministic dedupe key for a review request notification.
 * Bound to (booking, channel, stage) so reminder_1 and reminder_2 do
 * not collide.
 */
export function buildReviewRequestDedupeKey(
  bookingId: string,
  channel: ReviewChannel,
  stage: ReviewRequestStage,
): string {
  return `review:${bookingId}:${channel}:${stage}`;
}
