/**
 * W2 — Pure vendor-score derivation from raw PO/delivery history.
 *
 * This module turns the per-vendor aggregates the updater pulls out of
 * the database into the four 0..100 component sub-scores that
 * `computeVendorScore` (src/features/vendors/scoring.ts) then composes.
 *
 * NO `server-only`, NO `getDb` — it is a deterministic, side-effect-free
 * function so it can be unit-tested directly (pattern:
 * src/features/finance/statement-anomaly-rules.ts). The updater agent
 * and the compute-on-read scorecard query both feed it the same shape.
 *
 * Scoring rationale (all clamped to 0..100):
 *
 *   on-time     — share of delivery lines received on/before the PO's
 *                 expected_delivery_date. Late or missing-date lines
 *                 count against the vendor.
 *   quality     — share of delivery lines that passed QA
 *                 (quality_check_passed) blended with the header-level
 *                 acceptance status.
 *   price       — relative to peer median unit price for the same set
 *                 of delivered lines. Cheaper-than-median wins; we map a
 *                 ±40% spread around the cohort median onto 100..0.
 *   responsiveness — RFQ turnaround: how fast the vendor returns a
 *                 quotation after the request is raised. Faster wins.
 *
 * Each sub-score degrades gracefully: when a vendor has no signal for a
 * dimension we fall back to a neutral 70 (a "no news" baseline) so a
 * brand-new vendor isn't punished to zero and a single late delivery
 * doesn't tank an otherwise-strong record.
 */

import {
  computeVendorScore,
  type VendorScoreComponents,
  type VendorScoreResult,
} from "@/features/vendors/scoring";

/** Neutral baseline used when a dimension has no observations. */
export const NEUTRAL_SUBSCORE = 70;

/**
 * Raw, per-vendor aggregates over the scoring window. Every count is a
 * plain integer; price fields are bigint MINOR units (cents) to stay
 * money-safe end to end. The caller (DB query) is responsible for the
 * window filter and the per-vendor GROUP BY.
 */
export interface VendorHistoryAggregate {
  vendorId: string;
  /** Delivery lines received with a known PO expected date. */
  deliveredLines: number;
  /** Of `deliveredLines`, how many arrived on or before expected date. */
  onTimeLines: number;
  /** Delivery lines that passed the QA check. */
  qaPassedLines: number;
  /** Total delivery lines that carried a QA verdict. */
  qaCheckedLines: number;
  /** Header-level deliveries with quality_check_status = 'accepted'. */
  acceptedDeliveries: number;
  /** Total deliveries seen in the window. */
  totalDeliveries: number;
  /**
   * Weighted average unit price this vendor charged on delivered lines,
   * in USD minor units. Null when the vendor has no priced PO lines.
   */
  avgUnitPriceUsdMinor: number | null;
  /** Count of RFQ quotations this vendor returned in the window. */
  quotationsReturned: number;
  /**
   * Average days between the purchase request being raised and this
   * vendor returning a quotation. Null when no quotations in window.
   */
  avgQuoteTurnaroundDays: number | null;
}

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return NEUTRAL_SUBSCORE;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** On-time delivery rate → 0..100; neutral when no delivered lines. */
export function deriveOnTimeScore(agg: VendorHistoryAggregate): number {
  if (agg.deliveredLines <= 0) return NEUTRAL_SUBSCORE;
  return clamp100((agg.onTimeLines / agg.deliveredLines) * 100);
}

/**
 * Quality score blends line-level QA pass-rate (weight 0.7) with the
 * header-level acceptance rate (weight 0.3). Neutral when no signal.
 */
export function deriveQualityScore(agg: VendorHistoryAggregate): number {
  const haveLineSignal = agg.qaCheckedLines > 0;
  const haveHeaderSignal = agg.totalDeliveries > 0;
  if (!haveLineSignal && !haveHeaderSignal) return NEUTRAL_SUBSCORE;

  const linePass = haveLineSignal
    ? agg.qaPassedLines / agg.qaCheckedLines
    : null;
  const headerPass = haveHeaderSignal
    ? agg.acceptedDeliveries / agg.totalDeliveries
    : null;

  if (linePass !== null && headerPass !== null) {
    return clamp100((linePass * 0.7 + headerPass * 0.3) * 100);
  }
  return clamp100((linePass ?? headerPass ?? 0.7) * 100);
}

/**
 * Price score is RELATIVE to the cohort: a vendor at the cohort median
 * scores 70; a vendor 40%+ cheaper than median scores 100; a vendor
 * 40%+ more expensive scores ~30. Neutral when the vendor or cohort
 * has no priced lines.
 *
 * `cohortMedianUsdMinor` is the median avgUnitPrice across every vendor
 * in the window; passing 0/null disables the relative term and yields
 * the neutral baseline.
 */
export function derivePriceScore(
  agg: VendorHistoryAggregate,
  cohortMedianUsdMinor: number | null,
): number {
  if (
    agg.avgUnitPriceUsdMinor === null ||
    cohortMedianUsdMinor === null ||
    cohortMedianUsdMinor <= 0
  ) {
    return NEUTRAL_SUBSCORE;
  }
  // ratio < 1 → cheaper than median (good). Map ratio 0.6→100, 1.0→70,
  // 1.4→~30 with a linear slope of -100 per unit ratio around 1.0.
  const ratio = agg.avgUnitPriceUsdMinor / cohortMedianUsdMinor;
  const score = 70 - (ratio - 1) * 100;
  return clamp100(score);
}

/**
 * Responsiveness from RFQ turnaround. 0 days → 100, 2 days → ~85,
 * 14 days → ~30, falling ~5pts/day from a 100 ceiling. Neutral when
 * the vendor returned no quotations in the window.
 */
export function deriveResponsivenessScore(agg: VendorHistoryAggregate): number {
  if (agg.quotationsReturned <= 0 || agg.avgQuoteTurnaroundDays === null) {
    return NEUTRAL_SUBSCORE;
  }
  const score = 100 - agg.avgQuoteTurnaroundDays * 5;
  return clamp100(score);
}

export function deriveComponents(
  agg: VendorHistoryAggregate,
  cohortMedianUsdMinor: number | null,
): VendorScoreComponents {
  return {
    price: derivePriceScore(agg, cohortMedianUsdMinor),
    delivery: deriveOnTimeScore(agg),
    quality: deriveQualityScore(agg),
    responsiveness: deriveResponsivenessScore(agg),
  };
}

/**
 * Full pipeline: aggregate → components → composite/band. Pure.
 * The cohort median is computed across the supplied aggregate set so
 * the price term is self-consistent for one scoring run.
 */
export function scoreVendorFromHistory(
  agg: VendorHistoryAggregate,
  cohortMedianUsdMinor: number | null,
): VendorScoreResult {
  return computeVendorScore(deriveComponents(agg, cohortMedianUsdMinor));
}

/**
 * Median of the priced vendors' average unit prices, used as the price
 * cohort baseline. Returns null when no vendor has a priced average.
 */
export function cohortMedianUnitPrice(
  aggregates: VendorHistoryAggregate[],
): number | null {
  const priced = aggregates
    .map((a) => a.avgUnitPriceUsdMinor)
    .filter((p): p is number => p !== null && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (priced.length === 0) return null;
  const mid = Math.floor(priced.length / 2);
  return priced.length % 2 === 0
    ? Math.round((priced[mid - 1] + priced[mid]) / 2)
    : priced[mid];
}

/** Score every vendor in one cohort-consistent pass. */
export function scoreCohort(
  aggregates: VendorHistoryAggregate[],
): Array<{ vendorId: string; result: VendorScoreResult }> {
  const median = cohortMedianUnitPrice(aggregates);
  return aggregates.map((agg) => ({
    vendorId: agg.vendorId,
    result: scoreVendorFromHistory(agg, median),
  }));
}

export type { VendorScoreComponents, VendorScoreResult };
