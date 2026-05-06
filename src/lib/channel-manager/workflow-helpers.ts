/**
 * Stage 6.P1.F — Pure helpers for the reservation workflow.
 *
 * No I/O, no Drizzle, no `server-only` import — every helper is
 * runtime-testable. The orchestrating service in `service.ts` calls
 * these with data it has already loaded; nothing here touches the DB.
 *
 * Three helper categories:
 *   1. Mappers: ChannelReservationData → internal booking shape
 *   2. Diff: detect changes between two channel reservations
 *   3. Refund: per-policy refund calculation on cancellation
 *   4. Conflict: overlap detection across existing bookings
 */

import type { ChannelReservationData } from "./types";

// ---------------------------------------------------------------------------
// 1) mapReservationToBooking — channel reservation → bookings row insert
// ---------------------------------------------------------------------------

export interface InternalBookingDraft {
  villaId: string;
  guestId: string | null;
  channelId: string | null;
  bookingCode: string;
  sourceReference: string;
  status: "confirmed" | "cancelled" | "no_show" | "checked_out";
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  nights: number;
  adults: number | null;
  children: number | null;
  currency: string;
  /** Major units, decimal string for the numeric column. */
  grossAmount: string;
  channelFeeAmount: string;
  notes: string | null;
}

/**
 * Project a channel reservation into the shape the bookings table
 * expects for an INSERT. Caller resolves villaId + guestId + channelId
 * (via dedup queries) before invoking this.
 *
 * `bookingCode` follows the pattern CB-{channelKey}-{externalId} so
 * operators can trace back to the source channel from a booking row.
 */
export function mapReservationToBooking(input: {
  reservation: ChannelReservationData;
  villaId: string;
  guestId: string | null;
  channelId: string | null;
  channelKey: string;
}): InternalBookingDraft {
  const { reservation: r } = input;
  const checkIn = isoDate(r.checkIn);
  const checkOut = isoDate(r.checkOut);
  const nights = computeNights(r.checkIn, r.checkOut);

  return {
    villaId: input.villaId,
    guestId: input.guestId,
    channelId: input.channelId,
    bookingCode: deriveBookingCode(input.channelKey, r.externalReservationId),
    sourceReference: r.externalReservationId,
    status: mapStatusToInternal(r.externalStatus),
    checkIn,
    checkOut,
    nights,
    adults: r.adults,
    children: r.children ?? null,
    currency: r.currency,
    grossAmount: minorToDecimal(r.totalAmountMinor),
    channelFeeAmount: r.commissionMinor != null ? minorToDecimal(r.commissionMinor) : "0",
    notes: r.specialRequests ?? null,
  };
}

/**
 * Map external channel status strings (Booking's "Cancel", Airbnb's
 * "cancellation_by_guest", Trip.com's "no_show", etc.) to the
 * platform's internal booking status enum.
 */
export function mapStatusToInternal(
  externalStatus: string | undefined,
): "confirmed" | "cancelled" | "no_show" | "checked_out" {
  if (!externalStatus) return "confirmed";
  const lower = externalStatus.toLowerCase();
  if (
    lower === "cancel" ||
    lower === "cancelled" ||
    lower === "canceled" ||
    lower.includes("cancellation")
  ) {
    return "cancelled";
  }
  if (lower === "no_show" || lower === "noshow") return "no_show";
  if (lower === "completed" || lower === "checkout_complete") {
    return "checked_out";
  }
  return "confirmed";
}

// ---------------------------------------------------------------------------
// 2) detectChanges — diff old vs new reservation
// ---------------------------------------------------------------------------

export interface ReservationChange {
  field:
    | "checkIn"
    | "checkOut"
    | "adults"
    | "children"
    | "totalAmountMinor"
    | "currency"
    | "guest";
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Compare two channel reservations and emit a flat list of changes.
 * Used by the modification workflow to decide what to update on the
 * internal booking + whether to send a guest notification.
 *
 * `guest` change fires if any of firstName/lastName/email/phone differ.
 */
export function detectChanges(
  prev: ChannelReservationData,
  next: ChannelReservationData,
): ReservationChange[] {
  const out: ReservationChange[] = [];
  if (sameDateMs(prev.checkIn) !== sameDateMs(next.checkIn)) {
    out.push({
      field: "checkIn",
      oldValue: isoDate(prev.checkIn),
      newValue: isoDate(next.checkIn),
    });
  }
  if (sameDateMs(prev.checkOut) !== sameDateMs(next.checkOut)) {
    out.push({
      field: "checkOut",
      oldValue: isoDate(prev.checkOut),
      newValue: isoDate(next.checkOut),
    });
  }
  if (prev.adults !== next.adults) {
    out.push({ field: "adults", oldValue: prev.adults, newValue: next.adults });
  }
  if ((prev.children ?? 0) !== (next.children ?? 0)) {
    out.push({
      field: "children",
      oldValue: prev.children ?? 0,
      newValue: next.children ?? 0,
    });
  }
  if (prev.totalAmountMinor !== next.totalAmountMinor) {
    out.push({
      field: "totalAmountMinor",
      oldValue: prev.totalAmountMinor.toString(),
      newValue: next.totalAmountMinor.toString(),
    });
  }
  if (prev.currency !== next.currency) {
    out.push({
      field: "currency",
      oldValue: prev.currency,
      newValue: next.currency,
    });
  }
  if (
    prev.guest.firstName !== next.guest.firstName ||
    prev.guest.lastName !== next.guest.lastName ||
    prev.guest.email !== next.guest.email ||
    prev.guest.phone !== next.guest.phone
  ) {
    out.push({
      field: "guest",
      oldValue: prev.guest,
      newValue: next.guest,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3) calculateRefund — per-policy refund on cancellation
// ---------------------------------------------------------------------------

/**
 * Per-villa cancellation policy. Three breakpoints capture the most
 * common channel policies:
 *   - freeUntilDays: full refund if cancelled >= N days before check-in
 *   - moderateUntilDays: % refund between freeUntilDays and N days
 *   - lateRefundPct: refund % if cancelled inside moderate window
 *   - noShowRefundPct: refund % when guest doesn't show up
 *
 * Defaults match Booking.com's "moderate" policy if no per-villa policy
 * is set on the connection.
 */
export interface CancellationPolicy {
  freeUntilDays: number;
  moderateUntilDays: number;
  lateRefundPct: number;
  noShowRefundPct: number;
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  freeUntilDays: 14,
  moderateUntilDays: 7,
  lateRefundPct: 50,
  noShowRefundPct: 0,
};

export interface RefundCalculation {
  /** Refund amount in same minor units as totalAmountMinor. */
  refundMinor: bigint;
  /** Percent (0–100) for display. */
  refundPct: number;
  /** Bucket the policy landed in. */
  bucket: "free" | "moderate" | "late" | "no_show";
}

/**
 * Compute refund on cancellation. `cancelledAt` is the timestamp the
 * cancellation was reported; `checkIn` is the original check-in date.
 * `noShow=true` overrides the days-before logic — guests don't show up
 * on the day of, regardless of when the channel reports the no-show.
 */
export function calculateRefund(input: {
  totalAmountMinor: bigint;
  checkIn: Date;
  cancelledAt: Date;
  policy?: CancellationPolicy;
  noShow?: boolean;
}): RefundCalculation {
  const policy = input.policy ?? DEFAULT_CANCELLATION_POLICY;
  if (input.noShow) {
    return {
      refundMinor: pctOf(input.totalAmountMinor, policy.noShowRefundPct),
      refundPct: policy.noShowRefundPct,
      bucket: "no_show",
    };
  }
  const daysBefore = Math.floor(
    (input.checkIn.getTime() - input.cancelledAt.getTime()) / 86_400_000,
  );
  if (daysBefore >= policy.freeUntilDays) {
    return {
      refundMinor: input.totalAmountMinor,
      refundPct: 100,
      bucket: "free",
    };
  }
  if (daysBefore >= policy.moderateUntilDays) {
    return {
      refundMinor: pctOf(input.totalAmountMinor, policy.lateRefundPct),
      refundPct: policy.lateRefundPct,
      bucket: "moderate",
    };
  }
  return {
    refundMinor: pctOf(input.totalAmountMinor, 0),
    refundPct: 0,
    bucket: "late",
  };
}

function pctOf(amount: bigint, pct: number): bigint {
  // Round half up so 50% of 101 → 51 (not 50.5 truncated to 50).
  const numerator = amount * BigInt(Math.round(pct * 100));
  return (numerator + 5000n) / 10000n;
}

// ---------------------------------------------------------------------------
// 4) detectOverlap — calendar conflict detection
// ---------------------------------------------------------------------------

export interface ExistingBookingWindow {
  /** UUID of the conflicting booking or channel_reservation. */
  id: string;
  /** YYYY-MM-DD */
  checkIn: string;
  /** YYYY-MM-DD */
  checkOut: string;
  /** Used to skip self-overlaps when re-checking. */
  ignoreId?: string;
}

/**
 * Returns the IDs of every existing booking that overlaps the
 * candidate window. Two bookings overlap when the candidate's check-in
 * is strictly before the existing check-out AND the candidate's
 * check-out is strictly after the existing check-in.
 *
 * Same-day check-out + check-in does NOT count as overlap — turnover
 * day is a planned property-management state.
 */
export function detectOverlap(input: {
  candidateCheckIn: string;
  candidateCheckOut: string;
  candidateId?: string;
  existing: ExistingBookingWindow[];
}): string[] {
  const ci = new Date(input.candidateCheckIn).getTime();
  const co = new Date(input.candidateCheckOut).getTime();
  if (!isFinite(ci) || !isFinite(co) || co <= ci) return [];
  const conflicts: string[] = [];
  for (const e of input.existing) {
    if (input.candidateId && e.id === input.candidateId) continue;
    const eci = new Date(e.checkIn).getTime();
    const eco = new Date(e.checkOut).getTime();
    if (!isFinite(eci) || !isFinite(eco)) continue;
    // Overlap ↔ ci < eco AND co > eci. Touching boundaries do not overlap.
    if (ci < eco && co > eci) {
      conflicts.push(e.id);
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Internal date helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function sameDateMs(d: Date | string): number {
  if (typeof d === "string") return new Date(d).getTime();
  return d.getTime();
}

function computeNights(checkIn: Date | string, checkOut: Date | string): number {
  const a = typeof checkIn === "string" ? new Date(checkIn) : checkIn;
  const b = typeof checkOut === "string" ? new Date(checkOut) : checkOut;
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

function minorToDecimal(minor: bigint): string {
  // Convert minor units (cents) to decimal string for the numeric column.
  // Use BigInt math throughout to avoid float rounding on large amounts.
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const major = abs / 100n;
  const cents = abs % 100n;
  const centsStr = cents.toString().padStart(2, "0");
  return `${negative ? "-" : ""}${major.toString()}.${centsStr}`;
}

/** Public for tests + consumers needing the same convention. */
export function deriveBookingCode(
  channelKey: string,
  externalId: string,
): string {
  // Normalise channel key to UPPERCASE_SNAKE for visual scanning, and
  // strip any chars that would confuse spreadsheet exports.
  const slugChannel = channelKey.toUpperCase().replace(/[^A-Z0-9_]/g, "");
  const slugExternal = externalId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `CB-${slugChannel}-${slugExternal}`;
}
