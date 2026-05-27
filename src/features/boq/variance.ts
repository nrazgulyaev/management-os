/**
 * Phase 2.2 dev-03 — BOQ variance computation.
 *
 * Pure function. Compares an actuals roll-up against the planned
 * line total and classifies the delta into tones:
 *
 *   |Δ| ≤ 5%   → ok
 *   |Δ| ≤ 15%  → warn
 *   |Δ| > 15%  → danger
 *
 * Negative deltas are savings — same thresholds apply (a 30% saving
 * is still "danger" because it means the plan was wrong).
 *
 * Caller writes the result into `variance_reviews` when threshold
 * is exceeded; rows under 5% don't generate a review.
 */

export type DeltaTone = "ok" | "warn" | "danger" | "neutral";

export interface BoqLinePlan {
  /** Planned quantity. */
  qty: number;
  /** Planned unit rate. */
  rate: number;
  /** Cached planned line total = qty × rate. Useful when the line
   *  table stores the precomputed total; pass the raw multiplication
   *  if not. */
  lineTotal?: number;
}

export interface BoqActualsRollup {
  /** Sum of qty across `boq_actuals` rows. */
  qty: number;
  /** Average rate weighted by qty. */
  rate: number;
}

export interface VarianceResult {
  /** Planned total in major units. */
  planned: number;
  /** Actuals total in major units. */
  actual: number;
  /** Signed delta (actual − planned). */
  delta: number;
  /** Signed pct delta. */
  pct: number;
  tone: DeltaTone;
  /** True when the absolute pct exceeds the review threshold. */
  flagged: boolean;
}

const WARN_PCT = 5;
const DANGER_PCT = 15;

export function computeVariance(plan: BoqLinePlan, actuals: BoqActualsRollup | null): VarianceResult {
  const planned = plan.lineTotal ?? plan.qty * plan.rate;
  if (!actuals || actuals.qty === 0) {
    return { planned, actual: 0, delta: 0, pct: 0, tone: "neutral", flagged: false };
  }
  const actual = actuals.qty * actuals.rate;
  const delta = actual - planned;
  const pct = planned === 0 ? 0 : (delta / planned) * 100;
  const abs = Math.abs(pct);
  const tone: DeltaTone = abs <= WARN_PCT ? "ok" : abs <= DANGER_PCT ? "warn" : "danger";
  return { planned, actual, delta, pct, tone, flagged: abs > WARN_PCT };
}
