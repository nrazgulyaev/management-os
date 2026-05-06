/**
 * Pure helpers for direct-booking finance reconciliation.
 * No DB / no `server-only` import.
 */
import type { DepositStatus } from "./deposits-pure";

export type FinanceLinkStatus =
  | "pending"
  | "posted"
  | "skipped_no_booking"
  | "skipped_locked_period"
  | "failed"
  | "reversed";

export type RequestStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "converted";

function asBigint(v: bigint | number | string | null | undefined): bigint {
  if (v == null) return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return 0n;
    return BigInt(Math.trunc(v));
  }
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

/**
 * Pure: balance due = max(total - deposit, 0).
 * Negative inputs, null inputs, NaN all coerce to 0n.
 */
export function calculateBalanceDue(
  totalMinor: bigint | number | string | null | undefined,
  depositMinor: bigint | number | string | null | undefined,
): bigint {
  const total = asBigint(totalMinor);
  const deposit = asBigint(depositMinor);
  const due = total - deposit;
  return due < 0n ? 0n : due;
}

export function directBookingFinanceStatusLabel(status: FinanceLinkStatus): {
  label: string;
  tone: "info" | "success" | "warning" | "neutral" | "danger";
} {
  switch (status) {
    case "pending":
      return { label: "Pending", tone: "info" };
    case "posted":
      return { label: "Posted", tone: "success" };
    case "skipped_no_booking":
      return { label: "No booking yet", tone: "neutral" };
    case "skipped_locked_period":
      return { label: "Locked period", tone: "warning" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "reversed":
      return { label: "Reversed", tone: "neutral" };
  }
}

/**
 * Pure: revenue posting requires the request to be `converted`, the
 * booking to exist, AND the deposit to be in a paid state.
 *
 * The convert action allows a director-tier override that lands the
 * booking without a paid deposit; in that case the booking has
 * status `tentative` and the caller MUST pass the override flag for
 * us to allow posting.
 */
export function shouldPostDirectBookingRevenue(args: {
  requestStatus: RequestStatus;
  bookingId: string | null;
  depositStatus: DepositStatus | null;
  conversionOverride?: boolean;
}): { ok: boolean; reason: FinanceLinkStatus | "ok" } {
  if (args.requestStatus !== "converted") {
    return { ok: false, reason: "skipped_no_booking" };
  }
  if (!args.bookingId) return { ok: false, reason: "skipped_no_booking" };
  if (
    args.depositStatus === "paid" ||
    args.depositStatus === "manually_marked_paid"
  ) {
    return { ok: true, reason: "ok" };
  }
  if (args.conversionOverride) return { ok: true, reason: "ok" };
  return { ok: false, reason: "failed" };
}

export function buildDirectBookingFinanceLinkCode(
  date: string,
  counter: number,
): string {
  const datePart = date.replaceAll("-", "");
  const seq = String(Math.max(1, counter)).padStart(4, "0");
  return `DBF-${datePart}-${seq}`;
}

// =============================================================================
// Public stage summary — collapses internal statuses for the guest UI.
// =============================================================================

export type PublicStageKey =
  | "quote_held"
  | "request_submitted"
  | "team_review"
  | "deposit_requested"
  | "deposit_pending_verification"
  | "deposit_received"
  | "deposit_expired"
  | "booking_confirmed"
  | "request_rejected"
  | "request_expired";

export interface PublicStageSummary {
  current: PublicStageKey;
  label: string;
  detail: string;
  nextAction: string | null;
}

export interface StageSummaryInput {
  hold: { status: string };
  request: {
    status: RequestStatus;
  } | null;
  deposit: {
    status: DepositStatus;
    /** True after `notify-paid` was called by the guest. */
    guestClaimedPaid?: boolean;
  } | null;
  booking: { status: string } | null;
}

/**
 * Pure: derive the single most-relevant public stage from the
 * (hold, request, deposit, booking) tuple. Internal statuses
 * (`manually_marked_paid`, `under_review`, etc.) collapse onto the
 * public-facing stage labels.
 */
export function publicDirectBookingStageSummary(
  input: StageSummaryInput,
): PublicStageSummary {
  const { hold, request, deposit, booking } = input;
  // Booking confirmed wins.
  if (
    booking &&
    (booking.status === "confirmed" || booking.status === "tentative")
  ) {
    return {
      current: "booking_confirmed",
      label: "Booking confirmed",
      detail: "Your booking is locked in. Check your inbox for arrival info.",
      nextAction: null,
    };
  }
  // Terminal-failure paths.
  if (request?.status === "rejected") {
    return {
      current: "request_rejected",
      label: "Could not confirm",
      detail: "Our team could not confirm these dates. Please reach out to concierge for alternatives.",
      nextAction: null,
    };
  }
  if (request?.status === "expired" || hold.status === "expired") {
    return {
      current: "request_expired",
      label: "Hold expired",
      detail: "The hold timed out. Run a fresh quote to start over.",
      nextAction: null,
    };
  }
  if (deposit?.status === "expired") {
    return {
      current: "deposit_expired",
      label: "Deposit window expired",
      detail: "The deposit window passed. Please contact concierge to retry.",
      nextAction: null,
    };
  }
  // Deposit success path (manually_marked_paid + paid both collapse here).
  if (
    deposit &&
    (deposit.status === "paid" || deposit.status === "manually_marked_paid")
  ) {
    return {
      current: "deposit_received",
      label: "Payment received",
      detail: "We've recorded your deposit and are issuing your booking now.",
      nextAction: null,
    };
  }
  // Guest reported payment but admin hasn't verified yet.
  if (deposit?.guestClaimedPaid) {
    return {
      current: "deposit_pending_verification",
      label: "Awaiting verification",
      detail: "Thanks — our team is verifying your payment.",
      nextAction: null,
    };
  }
  if (deposit && (deposit.status === "pending" || deposit.status === "draft" || deposit.status === "requires_action")) {
    return {
      current: "deposit_requested",
      label: "Deposit requested",
      detail: "Please complete the deposit to confirm your booking.",
      nextAction: "Open the payment page",
    };
  }
  if (request?.status === "under_review") {
    return {
      current: "team_review",
      label: "Team review",
      detail: "Concierge is checking availability with the on-site team.",
      nextAction: null,
    };
  }
  if (request?.status === "submitted" || request?.status === "approved") {
    return {
      current: "request_submitted",
      label: "Request submitted",
      detail: "We've received your details. The concierge will review them shortly.",
      nextAction: null,
    };
  }
  // Default: just the hold.
  return {
    current: "quote_held",
    label: "Quote held",
    detail: "Submit your details to send a booking request.",
    nextAction: "Submit your details",
  };
}

// =============================================================================
// Deposit expiry predicates
// =============================================================================

export function isDepositExpired(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}

export function shouldExpireDeposit(
  status: DepositStatus,
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== "pending" && status !== "requires_action") return false;
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}
