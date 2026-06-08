/**
 * feat/w1de-lp-dashboard-gp-waterfall-copilot — LP/GP economics shaping.
 *
 * Pure, server-only-free module (no "server-only", no getDb) so the
 * GP-economics waterfall math is unit-testable in isolation — mirrors
 * the pattern of src/features/finance/statement-anomaly-rules.ts.
 *
 * Takes an investor's REAL position (contributed = drawn capital,
 * proceeds = distributed-to-date, both in USD MINOR units / cents) plus
 * the canonical European-waterfall fund terms, runs the canonical
 * `runWaterfall` calculator, and shapes the per-tier LP/GP split into
 * `WaterfallStage[]` ready for the existing <DistributionWaterfall>
 * award primitive.
 *
 * Money discipline: inputs arrive as bigint MINOR units. The canonical
 * `runWaterfall` calculator operates on MAJOR-unit numbers, so we divide
 * by 100 on the way in and the stage `amount` fields stay in major units
 * (the chart formats them itself). No float money is persisted here.
 */

import { runWaterfall, type WaterfallParams } from "./waterfall-calculator";
import type {
  WaterfallStage,
  WaterfallStageTone,
} from "@/components/award";

/**
 * Canonical European-waterfall fund terms. The schema does not yet carry
 * per-fund pref/carry/catch-up columns, so these mirror the defaults the
 * existing `runWaterfall` server wrapper (features/investors/queries.ts)
 * already ships. Surfaced as a constant so the page can caption them and
 * a future migration can swap in real per-fund terms in one place.
 *
 * TODO(lp-gp-economics): replace with real per-fund terms once the funds
 * schema carries pref_return_pct / catch_up_pct / carry_split_pct.
 */
export const CANONICAL_FUND_TERMS: Omit<WaterfallParams, "fundId"> = {
  mgmtFeePct: 2,
  prefReturnPct: 8,
  catchUpPct: 100,
  carrySplitPct: 20,
};

export interface LpGpEconomicsInput {
  /** Investor's drawn (contributed) capital, USD MINOR units (cents). */
  contributedUsdMinor: bigint;
  /** Total distributed-to-date proceeds for this position, USD MINOR. */
  distributedUsdMinor: bigint;
  /** Negotiated profit slice for this investor, 0..100. */
  profitSharePercent: number;
  /** Years held — drives the preferred-return accrual. Defaults to 1. */
  holdYears?: number;
  /** Override the canonical fund terms (testing / future per-fund). */
  terms?: Omit<WaterfallParams, "fundId">;
}

const TIER_LABEL: Record<string, string> = {
  "return-of-capital": "Return of capital",
  pref: "Preferred return",
  "catch-up": "GP catch-up",
  carry: "Carry split",
};

const TIER_TONE: Record<string, WaterfallStageTone> = {
  "return-of-capital": "ink",
  pref: "emerald",
  "catch-up": "gold",
  carry: "sage",
};

export interface LpGpEconomicsResult {
  /** Stages for <DistributionWaterfall>, one per non-empty tier. */
  stages: WaterfallStage[];
  /** Total flowing to this LP across all tiers, USD MAJOR units. */
  lpTotalMajor: number;
  /** Total flowing to the GP across all tiers, USD MAJOR units. */
  gpTotalMajor: number;
  /** True when there are no distributed proceeds to split yet. */
  isEmpty: boolean;
  /** The fund terms actually used (for captioning). */
  termsUsed: Omit<WaterfallParams, "fundId">;
}

/**
 * Shapes an investor's GP-economics waterfall. Each tier becomes a stage
 * whose `amount` is the LP take in that tier (GP-only tiers surface the
 * GP take with a "to GP" hint). Stages with a zero amount are dropped so
 * the chart never renders an empty 2px sliver.
 */
export function buildLpGpEconomics(
  input: LpGpEconomicsInput,
): LpGpEconomicsResult {
  const terms = input.terms ?? CANONICAL_FUND_TERMS;
  const contributedMajor = Number(input.contributedUsdMinor) / 100;
  const proceedsMajor = Number(input.distributedUsdMinor) / 100;
  const pct = Number.isFinite(input.profitSharePercent)
    ? Math.max(0, input.profitSharePercent)
    : 0;

  const result = runWaterfall({
    params: { fundId: "investor-position", ...terms },
    proceedsIdr: proceedsMajor,
    holdYears: input.holdYears ?? 1,
    lps: [
      {
        lpId: "self",
        pctOfFund: pct > 0 ? pct : 100,
        contributedIdr: contributedMajor,
      },
    ],
  });

  let lpTotalMajor = 0;
  let gpTotalMajor = 0;
  const stages: WaterfallStage[] = [];

  for (const tier of result.tiers) {
    lpTotalMajor += tier.lp;
    gpTotalMajor += tier.gp;

    const isGpTier = tier.gp > 0 && tier.lp === 0;
    const amount = isGpTier ? tier.gp : tier.lp;
    if (amount <= 0) continue;

    stages.push({
      label: TIER_LABEL[tier.tier] ?? tier.tier,
      amount,
      tone: TIER_TONE[tier.tier],
      hint: isGpTier
        ? "to GP"
        : tier.tier === "carry"
          ? `LP share · ${100 - terms.carrySplitPct}%`
          : "to LP",
    });
  }

  return {
    stages,
    lpTotalMajor,
    gpTotalMajor,
    isEmpty: proceedsMajor <= 0,
    termsUsed: terms,
  };
}
