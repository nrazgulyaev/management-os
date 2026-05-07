/**
 * Stage 7.0 retrofit — markup helper.
 *
 * Pure module. Given an actual API cost in USD + a markup percent (from
 * `subscription_plans.markupPercent`), returns:
 *   - actualCostUsd        — what the provider charged us
 *   - billedAmountUsd      — what we'd invoice the customer
 *   - markupApplied        — billed - actual, for transparency
 *
 * Markup is `0` for `internal` / `enterprise` plans (pass-through) and
 * 30/40/50 for paid tiers per the seed in migration 0086.
 *
 * No DB; no `import "server-only"` — testable.
 */

export interface MarkupBreakdown {
  actualCostUsd: number;
  billedAmountUsd: number;
  markupAppliedUsd: number;
  markupPercent: number;
}

export function applyMarkup(
  actualCostUsd: number,
  markupPercent: number,
): MarkupBreakdown {
  if (!Number.isFinite(actualCostUsd) || actualCostUsd < 0) {
    throw new Error("applyMarkup: actualCostUsd must be a non-negative finite number");
  }
  if (!Number.isInteger(markupPercent) || markupPercent < 0 || markupPercent > 1000) {
    throw new Error(
      "applyMarkup: markupPercent must be an integer in [0, 1000]",
    );
  }
  // Round to 4 decimals to align with the NUMERIC(12,4) column in
  // ai_assistant_runs / ai_org_usage_monthly.
  const billed = round4(actualCostUsd * (1 + markupPercent / 100));
  return {
    actualCostUsd: round4(actualCostUsd),
    billedAmountUsd: billed,
    markupAppliedUsd: round4(billed - actualCostUsd),
    markupPercent,
  };
}

/**
 * Convert a USD float to bigint USD-cents (minor units). Used by the
 * settle step that updates `ai_org_usage_monthly.total_cost_usd` (which
 * stays NUMERIC for fractional precision but is also reported to Stripe
 * as cents in Stage 7.D).
 */
export function usdToMinor(usd: number): bigint {
  if (!Number.isFinite(usd) || usd < 0) return 0n;
  return BigInt(Math.round(usd * 100));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
