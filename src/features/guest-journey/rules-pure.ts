/**
 * Pure helpers for the guest journey rule engine (Prompt 102).
 * No DB / no `server-only` import — every function is unit-testable.
 *
 * The engine is deterministic: a `(booking, rule)` pair maps to a
 * single `(scheduled_for, anchor_kind)` tuple, idempotent on re-run.
 */

export type JourneyStage =
  | "pre_arrival"
  | "arrival_day"
  | "in_stay"
  | "pre_checkout"
  | "checkout_day"
  | "post_stay";

export type TriggerAnchor =
  | "booking_created"
  | "check_in"
  | "check_out"
  | "stay_token_issued"
  | "guest_arrived"
  | "guest_checked_out";

export type JourneyRulePriority = "low" | "normal" | "high" | "urgent";
export type JourneyRuleStatus = "active" | "paused" | "archived";

export interface RuleShape {
  id: string;
  ruleKey: string;
  journeyStage: JourneyStage;
  triggerAnchor: TriggerAnchor;
  offsetMinutes: number;
  status: JourneyRuleStatus;
  villaId: string | null;
  projectId: string | null;
  appliesToChannel: string | null;
  channel: string;
  templateKey: string | null;
  suggestionType: string | null;
  serviceId: string | null;
  priority: JourneyRulePriority;
}

export interface BookingContext {
  id: string;
  villaId: string;
  projectId: string | null;
  channelKey: string | null;
  /** ISO date — YYYY-MM-DD. Half-open booking window. */
  checkIn: string;
  checkOut: string;
  status: string;
  /** Optional check-in / check-out time defaults — UTC, 24h. */
  defaultCheckInHourUtc?: number;
  defaultCheckOutHourUtc?: number;
  bookingCreatedAt?: Date | null;
  stayTokenIssuedAt?: Date | null;
  guestArrivedAt?: Date | null;
  guestCheckedOutAt?: Date | null;
}

/**
 * Pure: pick the anchor `Date` for a rule trigger.
 * Returns `null` when the booking does not yet have the timestamp the
 * anchor needs (e.g. `guest_arrived` while the guest has not arrived).
 *
 * Date anchors (check_in / check_out) default to 14:00Z and 11:00Z UTC
 * respectively when the booking does not provide explicit hours —
 * matching the typical Bali check-in window without overcomplicating
 * the model.
 */
export function resolveAnchorDate(
  booking: BookingContext,
  triggerAnchor: TriggerAnchor,
): Date | null {
  switch (triggerAnchor) {
    case "booking_created":
      return booking.bookingCreatedAt ?? null;
    case "check_in":
      return parseAnchorDate(
        booking.checkIn,
        booking.defaultCheckInHourUtc ?? 14,
      );
    case "check_out":
      return parseAnchorDate(
        booking.checkOut,
        booking.defaultCheckOutHourUtc ?? 11,
      );
    case "stay_token_issued":
      return booking.stayTokenIssuedAt ?? null;
    case "guest_arrived":
      return booking.guestArrivedAt ?? null;
    case "guest_checked_out":
      return booking.guestCheckedOutAt ?? null;
  }
}

function parseAnchorDate(isoDate: string, hourUtc: number): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const hh = String(Math.max(0, Math.min(23, hourUtc))).padStart(2, "0");
  const d = new Date(`${isoDate}T${hh}:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Pure: schedule offset is in minutes (negative = before, positive =
 * after). Returns null if the anchor is null.
 */
export function calculateScheduledFor(
  anchorDate: Date | null,
  offsetMinutes: number,
): Date | null {
  if (!anchorDate) return null;
  const ms = anchorDate.getTime() + offsetMinutes * 60_000;
  return new Date(ms);
}

/**
 * Pure: does this rule apply to this booking?
 * Cascade: paused / archived rules are skipped; villa / project /
 * channel scopes are applied if the rule sets them.
 */
export function ruleAppliesToBooking(
  rule: RuleShape,
  booking: BookingContext,
): boolean {
  if (rule.status !== "active") return false;
  if (rule.villaId && rule.villaId !== booking.villaId) return false;
  if (
    rule.projectId &&
    booking.projectId &&
    rule.projectId !== booking.projectId
  ) {
    return false;
  }
  if (rule.appliesToChannel && rule.appliesToChannel !== "any") {
    if (!booking.channelKey) return false;
    if (rule.appliesToChannel !== booking.channelKey) return false;
  }
  return true;
}

/**
 * Pure: should we skip this rule for this booking right now?
 * Returns the skip reason as a short string, or null when we should
 * proceed.
 */
export function shouldSkipRule(
  rule: RuleShape,
  booking: BookingContext,
  scheduledFor: Date | null,
  now: Date,
  opts?: { graceWindowMinutes?: number },
): string | null {
  if (rule.status !== "active") return "rule_not_active";
  if (booking.status === "cancelled") return "booking_cancelled";
  if (booking.status === "no_show") return "booking_no_show";
  if (!scheduledFor) return "anchor_unresolvable";
  // We allow a small grace window so "the cron ran 2 minutes after
  // the anchor" still fires the rule rather than skipping it as
  // expired.
  const grace = (opts?.graceWindowMinutes ?? 30) * 60_000;
  // post-stay rules are still valid up to 14 days after their
  // scheduled time; everyone else uses the grace window.
  const horizon =
    rule.journeyStage === "post_stay" ? 14 * 24 * 60 * 60 * 1000 : grace * 24;
  if (scheduledFor.getTime() < now.getTime() - horizon) {
    return "scheduled_window_expired";
  }
  return null;
}

/**
 * Pure: deterministic dedupe key for a `(booking, rule)` run. Used as
 * the unique anchor on `notification_queue.dedupe_key` and as the
 * idempotency key on the journey-run row.
 */
export function buildJourneyRunKey(
  bookingId: string,
  ruleId: string,
): string {
  return `journey:${bookingId}:${ruleId}`;
}

/**
 * Pure: notification dedupe key shape — separate function so tests
 * can pin the exact format. Append a date stamp so reminder rules
 * can fire on different days without colliding with each other.
 */
export function buildNotificationDedupeKey(
  bookingId: string,
  ruleId: string,
  scheduledFor: Date | null,
): string {
  const base = buildJourneyRunKey(bookingId, ruleId);
  if (!scheduledFor) return base;
  const iso =
    scheduledFor instanceof Date && !Number.isNaN(scheduledFor.getTime())
      ? scheduledFor.toISOString().slice(0, 10)
      : "";
  return iso ? `${base}:${iso}` : base;
}
