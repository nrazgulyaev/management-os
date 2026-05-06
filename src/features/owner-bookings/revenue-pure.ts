/**
 * Prompt 108 — Pure helpers for owner revenue source mix + breakdowns.
 *
 * No DB / no `server-only` import.  Owner-facing revenue copy never
 * leaks revenue_line ids, finance_link ids, or statement_period ids.
 * The only IDs we ever surface back to owners are owner_statement ids,
 * and only when the statement is issued / approved / paid.
 */

import {
  monthKey,
  type OwnerBookingSourceType,
} from "./calendar-pure";

// -----------------------------------------------------------------------------
// Breakdown taxonomy
// -----------------------------------------------------------------------------

export type RevenueBreakdownCategory =
  | "accommodation"
  | "cleaning_fee"
  | "service_revenue"
  | "taxes"
  | "ota_fee"
  | "payment_fee"
  | "management_fee"
  | "reserve"
  | "owner_payout_effect"
  | "other";

export type RevenueDirection = "revenue" | "deduction" | "neutral";

export const REVENUE_BREAKDOWN_CATEGORIES: ReadonlyArray<RevenueBreakdownCategory> =
  [
    "accommodation",
    "cleaning_fee",
    "service_revenue",
    "taxes",
    "ota_fee",
    "payment_fee",
    "management_fee",
    "reserve",
    "owner_payout_effect",
    "other",
  ];

export interface RevenueBreakdownEntry {
  category: RevenueBreakdownCategory;
  label: string;
  amountMinor: bigint;
  currency: string;
  direction: RevenueDirection;
  ownerVisible: boolean;
  sortOrder: number;
}

// -----------------------------------------------------------------------------
// Source bucket taxonomy (the monthly mix uses a coarser grouping than
// the per-booking source_type — owner cares about Direct vs OTA).
// -----------------------------------------------------------------------------

export type RevenueSourceBucket =
  | "direct_booking"
  | "ota"
  | "owner_stay"
  | "service_upsell"
  | "manual"
  | "other";

export const REVENUE_SOURCE_BUCKETS: ReadonlyArray<RevenueSourceBucket> = [
  "direct_booking",
  "ota",
  "owner_stay",
  "service_upsell",
  "manual",
  "other",
];

export function ownerSourceTypeToBucket(
  s: OwnerBookingSourceType,
): RevenueSourceBucket {
  if (s === "direct_booking") return "direct_booking";
  if (s === "ota_airbnb" || s === "ota_booking_com" || s === "ota_vrbo")
    return "ota";
  if (s === "owner_stay") return "owner_stay";
  if (s === "service_related") return "service_upsell";
  if (s === "manual") return "manual";
  return "other";
}

export function revenueSourceBucketLabel(b: RevenueSourceBucket): string {
  switch (b) {
    case "direct_booking":
      return "Direct bookings";
    case "ota":
      return "OTA / platform";
    case "owner_stay":
      return "Owner stays";
    case "service_upsell":
      return "Guest services";
    case "manual":
      return "Manual entries";
    case "other":
      return "Other";
  }
}

// -----------------------------------------------------------------------------
// Monthly bucket aggregation
// -----------------------------------------------------------------------------

export interface RevenueSourceMonthlyRow {
  ownerId: string;
  villaId: string | null;
  projectId: string | null;
  periodMonth: string; // first-of-month ISO
  sourceType: RevenueSourceBucket;
  grossRevenueMinor: bigint;
  deductionsMinor: bigint;
  netOwnerEffectMinor: bigint;
  bookingCount: number;
  occupiedNights: number;
  currency: string;
}

/**
 * Pure: bucket a list of input source-rows (one per booking-month-source)
 * into the monthly summary shape.  Inputs may include the same bucket
 * multiple times — they are summed deterministically.
 */
export interface RevenueSourceMonthlyInput {
  ownerId: string;
  villaId: string | null;
  projectId: string | null;
  serviceDate: string | Date;
  sourceType: OwnerBookingSourceType;
  grossRevenueMinor: bigint;
  deductionsMinor: bigint;
  netOwnerEffectMinor: bigint;
  bookingCount: number;
  occupiedNights: number;
  currency: string;
}

export function buildRevenueSourceMonthlyBuckets(
  rows: ReadonlyArray<RevenueSourceMonthlyInput>,
): RevenueSourceMonthlyRow[] {
  const map = new Map<string, RevenueSourceMonthlyRow>();
  for (const r of rows) {
    const bucket = ownerSourceTypeToBucket(r.sourceType);
    const period = monthKey(r.serviceDate);
    const key = [
      r.ownerId,
      r.villaId ?? "_",
      r.projectId ?? "_",
      period,
      bucket,
      r.currency,
    ].join("|");
    const existing = map.get(key);
    if (existing) {
      existing.grossRevenueMinor += r.grossRevenueMinor;
      existing.deductionsMinor += r.deductionsMinor;
      existing.netOwnerEffectMinor += r.netOwnerEffectMinor;
      existing.bookingCount += r.bookingCount;
      existing.occupiedNights += r.occupiedNights;
    } else {
      map.set(key, {
        ownerId: r.ownerId,
        villaId: r.villaId,
        projectId: r.projectId,
        periodMonth: period,
        sourceType: bucket,
        grossRevenueMinor: r.grossRevenueMinor,
        deductionsMinor: r.deductionsMinor,
        netOwnerEffectMinor: r.netOwnerEffectMinor,
        bookingCount: r.bookingCount,
        occupiedNights: r.occupiedNights,
        currency: r.currency,
      });
    }
  }
  const out = Array.from(map.values());
  out.sort((a, b) => {
    if (a.periodMonth !== b.periodMonth)
      return a.periodMonth < b.periodMonth ? 1 : -1;
    if (a.villaId !== b.villaId)
      return (a.villaId ?? "_").localeCompare(b.villaId ?? "_");
    return a.sourceType.localeCompare(b.sourceType);
  });
  return out;
}

/**
 * Pure: collapse monthly bucket rows into a single per-source summary
 * card list.  Used on the `/owner/revenue` landing.
 */
export interface RevenueSourceMixSummary {
  bucket: RevenueSourceBucket;
  label: string;
  grossRevenueMinor: bigint;
  deductionsMinor: bigint;
  netOwnerEffectMinor: bigint;
  bookingCount: number;
  occupiedNights: number;
  averageRevenuePerNightMinor: bigint;
  currency: string;
}

export function summarizeOwnerRevenueSourceMix(
  rows: ReadonlyArray<RevenueSourceMonthlyRow>,
  currency: string,
): RevenueSourceMixSummary[] {
  const map = new Map<RevenueSourceBucket, RevenueSourceMixSummary>();
  for (const r of rows) {
    if (r.currency !== currency) continue;
    const existing = map.get(r.sourceType);
    if (existing) {
      existing.grossRevenueMinor += r.grossRevenueMinor;
      existing.deductionsMinor += r.deductionsMinor;
      existing.netOwnerEffectMinor += r.netOwnerEffectMinor;
      existing.bookingCount += r.bookingCount;
      existing.occupiedNights += r.occupiedNights;
    } else {
      map.set(r.sourceType, {
        bucket: r.sourceType,
        label: revenueSourceBucketLabel(r.sourceType),
        grossRevenueMinor: r.grossRevenueMinor,
        deductionsMinor: r.deductionsMinor,
        netOwnerEffectMinor: r.netOwnerEffectMinor,
        bookingCount: r.bookingCount,
        occupiedNights: r.occupiedNights,
        averageRevenuePerNightMinor: 0n,
        currency: r.currency,
      });
    }
  }
  const out: RevenueSourceMixSummary[] = [];
  for (const bucket of REVENUE_SOURCE_BUCKETS) {
    const v = map.get(bucket);
    if (!v) continue;
    v.averageRevenuePerNightMinor =
      v.occupiedNights > 0
        ? v.grossRevenueMinor / BigInt(v.occupiedNights)
        : 0n;
    out.push(v);
  }
  return out;
}

/**
 * Pure: total monthly net owner effect.
 */
export function totalNetOwnerEffectMinor(
  rows: ReadonlyArray<RevenueSourceMonthlyRow>,
  currency: string,
): bigint {
  let sum = 0n;
  for (const r of rows) {
    if (r.currency !== currency) continue;
    sum += r.netOwnerEffectMinor;
  }
  return sum;
}

// -----------------------------------------------------------------------------
// Per-booking revenue explanation
// -----------------------------------------------------------------------------

export interface OwnerBookingSummaryShape {
  sourceType: OwnerBookingSourceType;
  publicStatus:
    | "inquiry"
    | "under_review"
    | "deposit_pending"
    | "confirmed"
    | "in_house"
    | "completed"
    | "cancelled"
    | "expired"
    | "blocked"
    | "maintenance"
    | "owner_stay";
  revenuePosted: boolean;
  statementId: string | null;
  totalAmountMinor: bigint | null;
}

/**
 * Pure: 1-3 sentence explanation that goes on the owner booking
 * detail page.
 *
 *   posted to a statement → "...has been posted to your owner statement."
 *   posted but no statement yet → "...will appear in your next statement after the period closes."
 *   pre-confirmation → "...is not yet generating revenue."
 */
export function formatOwnerRevenueExplanation(
  summary: OwnerBookingSummaryShape,
  breakdowns: ReadonlyArray<RevenueBreakdownEntry>,
): string {
  const status = summary.publicStatus;
  const hasBreakdown = breakdowns.length > 0;
  if (status === "completed" || status === "in_house" || status === "confirmed") {
    if (summary.revenuePosted && summary.statementId) {
      return summary.sourceType === "direct_booking"
        ? "This booking was made directly through Arconique and has been posted to your owner statement."
        : "This booking has been posted to your owner statement.";
    }
    if (summary.revenuePosted && !summary.statementId) {
      return "Revenue from this booking has been posted to finance and will appear in your next statement after the period closes.";
    }
    if (hasBreakdown) {
      return "This booking is confirmed but has not yet been posted to your owner statement.";
    }
    return "This booking is confirmed. Revenue will appear after check-out and statement generation.";
  }
  if (status === "deposit_pending") {
    return "We are waiting on a deposit before this booking can be confirmed. It is not yet generating revenue.";
  }
  if (status === "under_review" || status === "inquiry") {
    return "This is an inquiry — no revenue is recognised at this stage.";
  }
  if (status === "cancelled" || status === "expired") {
    return "This request did not become a confirmed booking. No revenue was generated.";
  }
  if (status === "owner_stay") {
    return "Owner stays do not generate booking revenue. Operational charges, if any, appear on your statement separately.";
  }
  if (status === "blocked" || status === "maintenance") {
    return "These dates are blocked from booking and do not generate revenue.";
  }
  return "Revenue will be reflected on your owner statement once the booking is finalised.";
}
