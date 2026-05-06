/**
 * Pure (no `server-only`) helpers for pricing math.
 *
 * Lives outside the server file so node:test specs can import without
 * dragging in the database client. Server functions in `pricing.ts`
 * call these helpers.
 */

import type {
  EscalationFrequency,
  PricingRuleSummary,
} from "@/lib/development/types/pricing";

export interface CalculatePriceInput {
  rule: PricingRuleSummary;
  /** Construction-progress percent at the moment of pricing (0–100). */
  constructionProgressPct: number;
  /** When the unit's "clock" started — typically the rule's start trigger. */
  ruleStartedAt: Date;
  /** When we're computing the price (now, or a back-dated point). */
  now: Date;
  /** Per-unit location coefficient (`unitDevelopmentMeta.locationCoefficient`). */
  locationCoefficient: number;
}

export interface CalculatePriceResult {
  basePriceUsdMinor: bigint;
  /** Base × (1 + escalationPercent × stepCount). Capped at ceiling if set. */
  escalatedPriceUsdMinor: bigint;
  /** Escalated × locationCoefficient. */
  finalPriceUsdMinor: bigint;
  stepCount: number;
  hitCeiling: boolean;
  reason: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function calculatePrice(input: CalculatePriceInput): CalculatePriceResult {
  const { rule, constructionProgressPct, ruleStartedAt, now } = input;
  const base = rule.basePriceUsdMinor;

  let stepCount = 0;
  let reason = "manual rule (no automatic escalation)";

  if (rule.ruleType === "time_based" && rule.escalationFrequency === "monthly") {
    const months = Math.max(
      0,
      Math.floor((now.getTime() - ruleStartedAt.getTime()) / (MS_PER_DAY * 30)),
    );
    stepCount = months;
    reason = `time-based · ${months} monthly step${months === 1 ? "" : "s"}`;
  } else if (rule.ruleType === "progress_based" && rule.escalationFrequency) {
    stepCount = stepsFromProgress(
      constructionProgressPct,
      rule.escalationFrequency,
    );
    reason = `progress-based · ${stepCount} step${stepCount === 1 ? "" : "s"} from ${constructionProgressPct}% progress`;
  }

  const escalationFactor = 1 + (Number(rule.escalationPercent) / 100) * stepCount;
  let escalatedMinor = BigInt(
    Math.round(Number(base) * escalationFactor),
  );

  let hitCeiling = false;
  if (rule.ceilingPriceUsdMinor !== null && escalatedMinor > rule.ceilingPriceUsdMinor) {
    escalatedMinor = rule.ceilingPriceUsdMinor;
    hitCeiling = true;
    reason += ` · ceiling applied`;
  }

  const coef = Number.isFinite(input.locationCoefficient)
    ? input.locationCoefficient
    : 1;
  const finalMinor = BigInt(Math.round(Number(escalatedMinor) * coef));

  return {
    basePriceUsdMinor: base,
    escalatedPriceUsdMinor: escalatedMinor,
    finalPriceUsdMinor: finalMinor,
    stepCount,
    hitCeiling,
    reason,
  };
}

export function stepsFromProgress(
  progressPct: number,
  frequency: EscalationFrequency,
): number {
  const p = Math.max(0, Math.min(100, progressPct));
  switch (frequency) {
    case "per_5_progress_pct":
      return Math.floor(p / 5);
    case "per_10_progress_pct":
      return Math.floor(p / 10);
    case "per_milestone":
      // Milestone-driven escalation is signaled externally via
      // unitPriceSnapshots.triggered_by='time_elapsed'/'progress_change'.
      // For pure-math purposes, we treat it as one-step-per-10-pct as a
      // reasonable approximation when called from this helper.
      return Math.floor(p / 10);
    case "monthly":
      return 0;
    default:
      return 0;
  }
}
