/**
 * Phase 2.4 dev-03 — Waterfall calculator (canonical math).
 *
 * Single source of truth for distribution math. No client-side
 * compute; the UI receives a WaterfallResult with bars[] +
 * footer KPIs precomputed.
 *
 * European waterfall, 4 tiers:
 *   1. Return of capital      — until LPs whole on contributed capital
 *   2. Pref return            — LPs earn pref_return_pct on capital
 *   3. GP catch-up            — GP catches up until carry split matches
 *   4. Carry split            — proceeds split per carry_split_pct
 *
 * Pro-rata LP allocation uses commitments.pct_of_fund.
 */

export interface WaterfallParams {
  fundId: string;
  mgmtFeePct: number;
  prefReturnPct: number;
  catchUpPct: number;
  /** % to GP at carry tier. */
  carrySplitPct: number;
}

export interface LpPosition {
  lpId: string;
  pctOfFund: number;
  contributedIdr: number;
}

export interface WaterfallInput {
  params: WaterfallParams;
  proceedsIdr: number;
  /** Time-weighted to compute pref. Defaults to assume 1.0 if omitted. */
  holdYears?: number;
  lps: LpPosition[];
}

export interface WaterfallBar {
  kind: "start" | "add" | "sub" | "neutral" | "total";
  label: string;
  sublabel?: string;
  value: number;
  cumulative: number;
}

export interface WaterfallTierAllocation {
  tier: "return-of-capital" | "pref" | "catch-up" | "carry";
  lp: number;
  gp: number;
}

export interface LpDistribution {
  lpId: string;
  amount: number;
}

export interface WaterfallResult {
  bars: WaterfallBar[];
  tiers: WaterfallTierAllocation[];
  lpDistributions: LpDistribution[];
  gpTotal: number;
  /** Footer KPIs for the chart caption. */
  kpis: { label: string; value: string }[];
}

function sum(list: number[]): number {
  return list.reduce((n, v) => n + v, 0);
}

export function runWaterfall(input: WaterfallInput): WaterfallResult {
  const { params, lps } = input;
  const proceeds = Math.max(0, input.proceedsIdr);
  const holdYears = input.holdYears ?? 1;

  let remaining = proceeds;
  const tiers: WaterfallTierAllocation[] = [];
  const bars: WaterfallBar[] = [];
  let cumulative = 0;
  bars.push({ kind: "start", label: "Proceeds", value: proceeds, cumulative: proceeds });
  cumulative = proceeds;

  // 1. Return of capital (LP-only).
  const totalContributed = sum(lps.map((l) => l.contributedIdr));
  const roc = Math.min(remaining, totalContributed);
  remaining -= roc;
  tiers.push({ tier: "return-of-capital", lp: roc, gp: 0 });
  cumulative -= roc;
  bars.push({ kind: "sub", label: "Return of capital", sublabel: "to LPs", value: -roc, cumulative });

  // 2. Preferred return: simple, hold-years-multiplied.
  const prefDue = totalContributed * (params.prefReturnPct / 100) * holdYears;
  const pref = Math.min(remaining, prefDue);
  remaining -= pref;
  tiers.push({ tier: "pref", lp: pref, gp: 0 });
  cumulative -= pref;
  bars.push({ kind: "sub", label: "Pref return", sublabel: `${params.prefReturnPct}% × ${holdYears}y`, value: -pref, cumulative });

  // 3. GP catch-up: GP gets catchUpPct of (lp+gp combined post-pref) until
  // their carry share equals carry_split_pct over (pref + their own).
  // Simplified linear catch-up: GP takes proceeds until totalCarrySoFar
  // / (pref + totalCarrySoFar) hits carry_split_pct.
  let catchUpToGp = 0;
  if (params.carrySplitPct > 0 && pref > 0 && remaining > 0) {
    // Target so GP has carrySplitPct of (pref + GP) ⇒
    //   gp / (pref + gp) = c  ⇒  gp = c·pref / (1 - c)
    const c = params.carrySplitPct / 100;
    const target = (c * pref) / Math.max(1e-9, 1 - c);
    catchUpToGp = Math.min(remaining, target);
    remaining -= catchUpToGp;
    tiers.push({ tier: "catch-up", lp: 0, gp: catchUpToGp });
    cumulative -= catchUpToGp;
    bars.push({ kind: "sub", label: "Catch-up", sublabel: "to GP", value: -catchUpToGp, cumulative });
  }

  // 4. Carry split.
  const gpCarry = Math.round(remaining * (params.carrySplitPct / 100));
  const lpCarry = remaining - gpCarry;
  remaining = 0;
  tiers.push({ tier: "carry", lp: lpCarry, gp: gpCarry });
  cumulative -= remaining + lpCarry + gpCarry;
  bars.push({ kind: "sub", label: "Carry — LPs", sublabel: `${100 - params.carrySplitPct}% split`, value: -lpCarry, cumulative });
  bars.push({ kind: "sub", label: "Carry — GP", sublabel: `${params.carrySplitPct}% split`, value: -gpCarry, cumulative });

  const lpTotal = roc + pref + lpCarry;
  const gpTotal = catchUpToGp + gpCarry;
  bars.push({ kind: "total", label: "Distributed", value: proceeds, cumulative: 0 });

  // LP distributions pro-rata against pctOfFund.
  const totalPct = sum(lps.map((l) => l.pctOfFund));
  const lpDistributions: LpDistribution[] = lps.map((l) => ({
    lpId: l.lpId,
    amount: totalPct > 0 ? Math.round(lpTotal * (l.pctOfFund / totalPct)) : 0,
  }));

  const kpis = [
    { label: "Proceeds", value: proceeds.toLocaleString() },
    { label: "LPs", value: lpTotal.toLocaleString() },
    { label: "GP", value: gpTotal.toLocaleString() },
    { label: "Carry split", value: `${params.carrySplitPct}%` },
  ];

  return { bars, tiers, lpDistributions, gpTotal, kpis };
}
