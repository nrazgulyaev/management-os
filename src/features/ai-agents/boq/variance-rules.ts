/**
 * W2-QSBOQ — deterministic BOQ variance classification rules.
 *
 * Pure module (no `server-only`, no `getDb`) so it is unit-testable
 * the same way `src/features/finance/statement-anomaly-rules.ts` is.
 * The `variance-detector` agent + the QS cabinet page both feed their
 * plan/actual rollups through here so the flag set is identical
 * everywhere (agent queue vs the on-page VarianceCard).
 *
 * Builds on `computeVariance` (src/features/boq/variance.ts) for the
 * planned/actual totals + tone, then layers on:
 *   - a discrete `VarianceReviewKind` (qty vs rate vs budget direction)
 *   - the signed pct / USD-equivalent magnitudes the
 *     `variance_reviews` row stores.
 *
 * Money in / out of this module is in MAJOR units to stay aligned with
 * `computeVariance` (which multiplies qty × rate as plain numbers). The
 * caller converts minor↔major at the query boundary.
 */

import { computeVariance, type VarianceResult } from "@/features/boq/variance";
import type { VarianceReviewKind } from "@/lib/db/schema/variance-reviews";

/** Lines crossing this absolute pct land in the QS review queue. */
export const VARIANCE_FLAG_PCT = 5;

/** Above this absolute qty drift we treat the variance as qty-driven. */
const QTY_DOMINANT_PCT = 2;

export interface VarianceLineInput {
  /** Stable BOQ line id (boq_items.id). */
  lineId: string;
  /** Planned quantity (current revision). */
  qtyPlanned: number;
  /** Planned unit rate, MAJOR units. */
  ratePlanned: number;
  /** Rolled-up actual quantity across boq_actuals rows. */
  qtyActual: number;
  /** Qty-weighted average actual unit rate, MAJOR units. */
  rateActual: number;
}

export interface VarianceFlag {
  lineId: string;
  /** Full computeVariance result (planned/actual/delta/pct/tone/flagged). */
  variance: VarianceResult;
  /** Discrete review kind for the variance_reviews.kind column. */
  kind: VarianceReviewKind;
  /** Signed pct drift on total (actual − planned) / planned. */
  magnitudePct: number;
  /** Signed total drift in MAJOR units (== variance.delta). */
  magnitudeMajor: number;
  /** Signed pct drift attributable to quantity. */
  qtyPct: number;
  /** Signed pct drift attributable to unit rate. */
  ratePct: number;
}

function pctDelta(planned: number, actual: number): number {
  if (planned === 0) return actual === 0 ? 0 : 100;
  return ((actual - planned) / planned) * 100;
}

/**
 * Classify a single line's plan-vs-actual into a discrete review kind.
 *
 * Priority:
 *   1. No actuals yet → "other" (won't be flagged; computeVariance
 *      returns tone "neutral", flagged=false).
 *   2. Quantity drift dominates rate drift (and is material) → qty_mismatch.
 *   3. Rate drift dominates → rate_change.
 *   4. Otherwise fall back to over/under budget on the signed total.
 */
export function classifyVarianceKind(input: VarianceLineInput): VarianceReviewKind {
  const { qtyPlanned, qtyActual, ratePlanned, rateActual } = input;
  if (qtyActual <= 0) return "other";

  const qtyPct = pctDelta(qtyPlanned, qtyActual);
  const ratePct = pctDelta(ratePlanned, rateActual);
  const absQty = Math.abs(qtyPct);
  const absRate = Math.abs(ratePct);

  if (absQty >= QTY_DOMINANT_PCT && absQty >= absRate) return "qty_mismatch";
  if (absRate >= QTY_DOMINANT_PCT && absRate > absQty) return "rate_change";

  const totalDelta = qtyActual * rateActual - qtyPlanned * ratePlanned;
  return totalDelta >= 0 ? "over_budget" : "under_budget";
}

/** Compute the full flag payload for one line. */
export function evaluateVarianceLine(input: VarianceLineInput): VarianceFlag {
  const variance = computeVariance(
    { qty: input.qtyPlanned, rate: input.ratePlanned },
    input.qtyActual > 0 ? { qty: input.qtyActual, rate: input.rateActual } : null,
  );
  return {
    lineId: input.lineId,
    variance,
    kind: classifyVarianceKind(input),
    magnitudePct: variance.pct,
    magnitudeMajor: variance.delta,
    qtyPct: pctDelta(input.qtyPlanned, input.qtyActual),
    ratePct: pctDelta(input.ratePlanned, input.rateActual),
  };
}

/**
 * Run the rules over a batch of lines and return only those that cross
 * the review threshold (|pct| > VARIANCE_FLAG_PCT). Lines without
 * actuals (tone "neutral") are never flagged.
 */
export function detectVariances(lines: VarianceLineInput[]): VarianceFlag[] {
  const flags: VarianceFlag[] = [];
  for (const line of lines) {
    const flag = evaluateVarianceLine(line);
    if (flag.variance.flagged) flags.push(flag);
  }
  return flags;
}
