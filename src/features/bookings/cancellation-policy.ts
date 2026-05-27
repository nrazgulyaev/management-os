/**
 * Phase 2.2 mgmt-01 — Cancellation refund policy.
 *
 * Default ladder:
 *   > 14 days to check-in   → 100% refund
 *   7–14 days to check-in   → 50% refund
 *   < 7 days to check-in    → 0% refund
 *
 * Director override forces 100%. Channel-specific overrides (e.g.
 * Airbnb's own policy) take precedence in 2.2 data; today the
 * function treats every channel identically.
 */

export interface RefundInput {
  /** Booking gross in major units. */
  grossAmount: number;
  /** ISO YYYY-MM-DD. */
  checkIn: string;
  /** Channel hint (informational, used for `channel` in the result). */
  channel?: string;
  /** Pass true to override the ladder and refund 100%. */
  directorOverride?: boolean;
  /** Override "today" for testing. */
  today?: Date;
}

export type RefundReason = "policy-full" | "policy-half" | "policy-none" | "director-override";

export interface RefundResult {
  /** Refund in major units. */
  amount: number;
  /** Pct returned (0..100). */
  pct: number;
  channel: string;
  reason: RefundReason;
  /** Days until check-in (negative if check-in already happened). */
  daysToCheckIn: number;
}

export function computeRefund({
  grossAmount,
  checkIn,
  channel = "direct",
  directorOverride,
  today,
}: RefundInput): RefundResult {
  const now = today ?? new Date();
  const ci = new Date(checkIn + "T00:00:00Z");
  const days = Math.ceil((ci.getTime() - now.getTime()) / 86_400_000);

  if (directorOverride) {
    return {
      amount: grossAmount,
      pct: 100,
      channel,
      reason: "director-override",
      daysToCheckIn: days,
    };
  }

  let pct = 0;
  let reason: RefundReason = "policy-none";
  if (days > 14) {
    pct = 100;
    reason = "policy-full";
  } else if (days >= 7) {
    pct = 50;
    reason = "policy-half";
  }

  return {
    amount: Math.round((grossAmount * pct) / 100),
    pct,
    channel,
    reason,
    daysToCheckIn: days,
  };
}
