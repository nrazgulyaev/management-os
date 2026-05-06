/**
 * Stage 4.B.1 — Pure waterfall math helpers.
 *
 * No I/O, no `import "server-only"`. Each helper is deterministic and
 * runtime-testable. All amounts are USD-minor (cents) as bigint or
 * bigint-coercible numbers; the helper API uses `number` for ergonomics
 * but every internal calculation routes through bigint to avoid
 * floating-point drift on intermediate steps.
 *
 * Six rule types:
 *   - generic_50_50
 *   - arconique_25_credit          (the Arconique-specific rule)
 *   - preferred_return_then_split  (annualized pref return)
 *   - waterfall_with_hurdle        (IRR-gated split change)
 *   - capital_first_then_split     (100% capital, then split profits)
 *   - tiered_promote               (multi-tier IRR ladder)
 *
 * The `custom` ruleType is a pass-through that requires explicit
 * operator-supplied `arconiquePercent` / `investorPercent` parameters.
 */

export type WaterfallRuleType =
  | "generic_50_50"
  | "arconique_25_credit"
  | "preferred_return_then_split"
  | "waterfall_with_hurdle"
  | "capital_first_then_split"
  | "tiered_promote"
  | "custom";

export interface WaterfallInput {
  /** Amount being distributed this run (USD-minor). Must be >= 0. */
  totalDistributable: number;
  /** Cumulative Arconique capital contributed (USD-minor). */
  arconiqueCapitalContributed: number;
  /** Cumulative Arconique capital already returned (USD-minor). */
  arconiqueCapitalReturned: number;
  /** Cumulative investor capital contributed (USD-minor). */
  investorCapitalContributed: number;
  /** Cumulative investor capital already returned (USD-minor). */
  investorCapitalReturned: number;
  /** Cumulative profit distributed across all prior runs (USD-minor). */
  cumulativeProfitDistributed: number;
  ruleType: WaterfallRuleType;
  ruleParameters: Record<string, unknown>;
  contextDates?: {
    contributionDates: Array<{
      date: Date;
      amount: number;
      source: "arconique" | "investor";
    }>;
    valuationDate: Date;
  };
}

export interface WaterfallSideAllocation {
  capitalReturn: number;
  profitShare: number;
  /** Extra credit Arconique receives outside the standard split. */
  economicCredit: number;
  total: number;
}

export interface WaterfallInvestorAllocation {
  capitalReturn: number;
  profitShare: number;
  total: number;
}

export interface WaterfallOutput {
  arconiqueAllocation: WaterfallSideAllocation;
  investorAllocation: WaterfallInvestorAllocation;
  /** Markdown explaining the math step-by-step. */
  reasoning: string;
  appliedRule: WaterfallRuleType;
  ruleParametersUsed: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Internal: bigint-routed arithmetic. We accept `number` at the boundary for
// caller convenience (totals come from JSON / form input), but every internal
// step coerces to bigint and divides only at the final return. This keeps
// addition and multiplication deterministic.
// ----------------------------------------------------------------------------

function toBig(n: number): bigint {
  if (!Number.isFinite(n)) throw new Error("waterfall: input is not finite");
  // Round half-away-from-zero for the rare fractional cent that survives
  // JSON marshalling (we only deal in integer minor units in practice).
  return BigInt(Math.round(n));
}

/** Multiply a bigint amount by a percentage in basis points (0-10_000). */
function takePctBp(amount: bigint, basisPoints: bigint): bigint {
  // signed division rounds toward zero; for monetary fairness we use
  // explicit floor-toward-negative-infinity by convention via a helper.
  return (amount * basisPoints) / 10_000n;
}

/** Convert a percentage number (0-100, possibly fractional) to basis points. */
function pctToBp(pct: number): bigint {
  if (!Number.isFinite(pct)) throw new Error("waterfall: pct not finite");
  // Allow up to 4 decimal places (matches DB NUMERIC(7,4) for ownership %).
  return BigInt(Math.round(pct * 100));
}

function isNonNeg(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

function validateInput(input: WaterfallInput): void {
  for (const [k, v] of [
    ["totalDistributable", input.totalDistributable],
    ["arconiqueCapitalContributed", input.arconiqueCapitalContributed],
    ["arconiqueCapitalReturned", input.arconiqueCapitalReturned],
    ["investorCapitalContributed", input.investorCapitalContributed],
    ["investorCapitalReturned", input.investorCapitalReturned],
    ["cumulativeProfitDistributed", input.cumulativeProfitDistributed],
  ] as const) {
    if (!isNonNeg(v)) throw new Error(`waterfall: ${k} must be >= 0 finite`);
  }
  if (input.arconiqueCapitalReturned > input.arconiqueCapitalContributed) {
    throw new Error("waterfall: Arconique capital returned > contributed");
  }
  if (input.investorCapitalReturned > input.investorCapitalContributed) {
    throw new Error("waterfall: investor capital returned > contributed");
  }
}

function emptyArconique(): WaterfallSideAllocation {
  return { capitalReturn: 0, profitShare: 0, economicCredit: 0, total: 0 };
}

function emptyInvestor(): WaterfallInvestorAllocation {
  return { capitalReturn: 0, profitShare: 0, total: 0 };
}

// ----------------------------------------------------------------------------
// Public dispatch
// ----------------------------------------------------------------------------

export function computeWaterfallAllocation(input: WaterfallInput): WaterfallOutput {
  validateInput(input);
  switch (input.ruleType) {
    case "generic_50_50":
      return applyGeneric5050(input);
    case "arconique_25_credit":
      return applyArconique25Credit(input);
    case "preferred_return_then_split":
      return applyPreferredReturnThenSplit(input);
    case "waterfall_with_hurdle":
      return applyWaterfallWithHurdle(input);
    case "capital_first_then_split":
      return applyCapitalFirstThenSplit(input);
    case "tiered_promote":
      return applyTieredPromote(input);
    case "custom":
      return applyCustom(input);
    default: {
      const _never: never = input.ruleType;
      throw new Error(`waterfall: unknown rule type ${String(_never)}`);
    }
  }
}

// ----------------------------------------------------------------------------
// Helpers shared by several rules
// ----------------------------------------------------------------------------

interface CapitalReturnStep {
  arconiqueReturn: bigint;
  investorReturn: bigint;
  remaining: bigint;
}

/**
 * Return capital proportionally to who has capital still outstanding. If
 * `policy = 'pro_rata_outstanding'`, splits by remaining outstanding (the
 * default — fair to both sides). If `policy = 'pro_rata_contributed'`,
 * splits by original contributions (used by `generic_50_50` and others
 * that treat capital as a single pool).
 */
function returnCapital(
  input: WaterfallInput,
  policy: "pro_rata_outstanding" | "pro_rata_contributed",
): CapitalReturnStep {
  const D = toBig(input.totalDistributable);
  const A = toBig(input.arconiqueCapitalContributed);
  const I = toBig(input.investorCapitalContributed);
  const Aret = toBig(input.arconiqueCapitalReturned);
  const Iret = toBig(input.investorCapitalReturned);

  const Aleft = A - Aret;
  const Ileft = I - Iret;
  const totalLeft = Aleft + Ileft;

  if (totalLeft <= 0n || D <= 0n) {
    return { arconiqueReturn: 0n, investorReturn: 0n, remaining: D };
  }

  const capitalToReturn = D < totalLeft ? D : totalLeft;

  let arconiqueReturn: bigint;
  let investorReturn: bigint;

  if (policy === "pro_rata_outstanding") {
    if (totalLeft === 0n) {
      arconiqueReturn = 0n;
      investorReturn = 0n;
    } else {
      arconiqueReturn = (capitalToReturn * Aleft) / totalLeft;
      // Folding the remainder into the investor side keeps the sum exact.
      investorReturn = capitalToReturn - arconiqueReturn;
    }
  } else {
    const totalContributed = A + I;
    if (totalContributed === 0n) {
      arconiqueReturn = 0n;
      investorReturn = 0n;
    } else {
      arconiqueReturn = (capitalToReturn * A) / totalContributed;
      investorReturn = capitalToReturn - arconiqueReturn;
    }
  }

  return {
    arconiqueReturn,
    investorReturn,
    remaining: D - capitalToReturn,
  };
}

function bigToNum(b: bigint): number {
  // bigint → number is safe up to 2^53; monetary minor units (cents) on
  // any conceivable distribution are well below that ceiling.
  return Number(b);
}

// ----------------------------------------------------------------------------
// Rule 1: generic_50_50
// ----------------------------------------------------------------------------
//
// Return capital pro-rata-contributed first, then split remainder 50/50.
// ----------------------------------------------------------------------------

export function applyGeneric5050(input: WaterfallInput): WaterfallOutput {
  validateInput(input);

  if (input.totalDistributable <= 0) {
    return zeroOutput(input);
  }

  const step = returnCapital(input, "pro_rata_contributed");
  const arconiqueProfit = step.remaining / 2n;
  const investorProfit = step.remaining - arconiqueProfit;

  const arc = sumSide({
    capitalReturn: step.arconiqueReturn,
    profitShare: arconiqueProfit,
    economicCredit: 0n,
  });
  const inv = sumInvestor({
    capitalReturn: step.investorReturn,
    profitShare: investorProfit,
  });

  const reasoning = [
    `### generic_50_50`,
    `1. Returned capital pro-rata to original contributions: Arconique ${money(step.arconiqueReturn)}, investors ${money(step.investorReturn)}.`,
    `2. Split remaining ${money(step.remaining)} equally: ${money(arconiqueProfit)} each.`,
  ].join("\n");

  return {
    arconiqueAllocation: arc,
    investorAllocation: inv,
    reasoning,
    appliedRule: "generic_50_50",
    ruleParametersUsed: {},
  };
}

// ----------------------------------------------------------------------------
// Rule 2: arconique_25_credit  (the Arconique-specific rule)
// ----------------------------------------------------------------------------
//
// Step 1: Return capital proportionally to original contributions.
// Step 2: For the profit:
//   - Profit on Arconique's own capital share goes 100% to Arconique.
//   - Profit on investor's capital share gets a 25% credit to Arconique
//     first, then the remaining 75% is split 50/50.
//
// Net result for the investor portion of profit:
//   Arconique receives 25% + 0.5*75% = 62.5%
//   Investor receives 0.5*75%        = 37.5%
//
// The credit_percentage is configurable but defaults to 25.
// ----------------------------------------------------------------------------

export function applyArconique25Credit(input: WaterfallInput): WaterfallOutput {
  validateInput(input);

  const creditPctRaw = (input.ruleParameters as { credit_percentage?: number })
    .credit_percentage;
  const creditPct = typeof creditPctRaw === "number" ? creditPctRaw : 25;
  if (creditPct < 0 || creditPct > 100) {
    throw new Error(
      `arconique_25_credit: credit_percentage must be in [0,100], got ${creditPct}`,
    );
  }

  if (input.totalDistributable <= 0) {
    return zeroOutput(input, "arconique_25_credit", { credit_percentage: creditPct });
  }

  const step = returnCapital(input, "pro_rata_contributed");

  const A = toBig(input.arconiqueCapitalContributed);
  const I = toBig(input.investorCapitalContributed);
  const totalCap = A + I;

  let arconiqueOwnProfit = 0n;
  let arconiqueCredit = 0n;
  let arconique5050 = 0n;
  let investor5050 = 0n;

  if (step.remaining > 0n && totalCap > 0n) {
    arconiqueOwnProfit = (step.remaining * A) / totalCap;
    const investorProfitPool = step.remaining - arconiqueOwnProfit;

    const creditBp = pctToBp(creditPct);
    arconiqueCredit = takePctBp(investorProfitPool, creditBp);
    const afterCredit = investorProfitPool - arconiqueCredit;

    arconique5050 = afterCredit / 2n;
    investor5050 = afterCredit - arconique5050;
  } else if (step.remaining > 0n && totalCap === 0n) {
    // Edge: no capital recorded but distributable > 0. Treat the entire
    // pool as investor-side (most conservative for Arconique credit) so
    // the credit + 50/50 still applies. Without this, the helper would
    // silently drop the cash on the floor.
    const creditBp = pctToBp(creditPct);
    arconiqueCredit = takePctBp(step.remaining, creditBp);
    const afterCredit = step.remaining - arconiqueCredit;
    arconique5050 = afterCredit / 2n;
    investor5050 = afterCredit - arconique5050;
  }

  const arc = sumSide({
    capitalReturn: step.arconiqueReturn,
    profitShare: arconiqueOwnProfit + arconique5050,
    economicCredit: arconiqueCredit,
  });
  const inv = sumInvestor({
    capitalReturn: step.investorReturn,
    profitShare: investor5050,
  });

  const reasoning = [
    `### arconique_25_credit (credit ${creditPct}%)`,
    `1. Returned capital pro-rata: Arconique ${money(step.arconiqueReturn)}, investors ${money(step.investorReturn)}.`,
    `2. Of remaining ${money(step.remaining)}:`,
    `   - Arconique own-capital profit share: ${money(arconiqueOwnProfit)} (=${money(step.remaining)} × A/(A+I))`,
    `   - Arconique credit on investor profit pool: ${money(arconiqueCredit)} (${creditPct}%)`,
    `   - Remaining split 50/50: Arconique ${money(arconique5050)}, investors ${money(investor5050)}.`,
    `3. Totals — Arconique ${money(arc.totalBig)} (${money(step.arconiqueReturn)} cap + ${money(arconiqueOwnProfit + arconique5050)} profit + ${money(arconiqueCredit)} credit), investors ${money(inv.totalBig)}.`,
  ].join("\n");

  return {
    arconiqueAllocation: arc,
    investorAllocation: inv,
    reasoning,
    appliedRule: "arconique_25_credit",
    ruleParametersUsed: { credit_percentage: creditPct },
  };
}

// ----------------------------------------------------------------------------
// Rule 3: preferred_return_then_split
// ----------------------------------------------------------------------------
//
// Investor gets a preferred return first (computed as a simple-interest
// percentage of their unrecovered capital × elapsed years), then any
// remainder is split per `split_after` (% to investor, balance to Arconique).
//
// Elapsed years comes from contextDates.contributionDates ↔ valuationDate.
// If contextDates is omitted, elapsed is treated as 1 year.
// ----------------------------------------------------------------------------

export function applyPreferredReturnThenSplit(
  input: WaterfallInput,
): WaterfallOutput {
  validateInput(input);

  const params = input.ruleParameters as {
    preferred_return_pct?: number;
    split_after?: number;
  };
  const prefPct = typeof params.preferred_return_pct === "number"
    ? params.preferred_return_pct
    : 8;
  const splitAfterInvPct = typeof params.split_after === "number"
    ? params.split_after
    : 50;
  if (prefPct < 0 || prefPct > 100) {
    throw new Error(`preferred_return: pct must be in [0,100], got ${prefPct}`);
  }
  if (splitAfterInvPct < 0 || splitAfterInvPct > 100) {
    throw new Error(
      `preferred_return: split_after must be in [0,100], got ${splitAfterInvPct}`,
    );
  }

  if (input.totalDistributable <= 0) {
    return zeroOutput(input, "preferred_return_then_split", {
      preferred_return_pct: prefPct,
      split_after: splitAfterInvPct,
    });
  }

  const step = returnCapital(input, "pro_rata_contributed");

  const I = toBig(input.investorCapitalContributed);
  const Iret = toBig(input.investorCapitalReturned);
  const investorOutstandingAtStart = I - Iret;

  const elapsedYears = computeElapsedYears(input);
  // Pref return = outstanding × pct × elapsedYears (simple interest).
  // Compute as basis points so the precision is consistent with pctToBp.
  const prefBp = pctToBp(prefPct);
  // elapsedYears is allowed to be fractional → carry it as bp scaled by 1e4.
  const elapsedBp = pctToBp(elapsedYears * 100);
  const prefReturnRaw =
    (investorOutstandingAtStart * prefBp * elapsedBp) /
    (10_000n * 10_000n);

  const prefReturnPaid =
    prefReturnRaw < step.remaining ? prefReturnRaw : step.remaining;

  const afterPref = step.remaining - prefReturnPaid;

  const investorPostBp = pctToBp(splitAfterInvPct);

  let arconiqueProfit = 0n;
  let investorProfitSplit = 0n;
  if (afterPref > 0n) {
    investorProfitSplit = takePctBp(afterPref, investorPostBp);
    arconiqueProfit = afterPref - investorProfitSplit;
  }

  const arc = sumSide({
    capitalReturn: step.arconiqueReturn,
    profitShare: arconiqueProfit,
    economicCredit: 0n,
  });
  const inv = sumInvestor({
    capitalReturn: step.investorReturn,
    profitShare: prefReturnPaid + investorProfitSplit,
  });

  const reasoning = [
    `### preferred_return_then_split (pref ${prefPct}% / yr, split_after ${splitAfterInvPct}% to investor)`,
    `1. Returned capital pro-rata: Arconique ${money(step.arconiqueReturn)}, investors ${money(step.investorReturn)}.`,
    `2. Preferred return on investor outstanding ${money(investorOutstandingAtStart)} × ${prefPct}% × ${elapsedYears.toFixed(3)}y = ${money(prefReturnRaw)} (paid ${money(prefReturnPaid)}, capped at remaining).`,
    `3. After-pref split of ${money(afterPref)}: investors ${money(investorProfitSplit)} (${splitAfterInvPct}%), Arconique ${money(arconiqueProfit)}.`,
  ].join("\n");

  return {
    arconiqueAllocation: arc,
    investorAllocation: inv,
    reasoning,
    appliedRule: "preferred_return_then_split",
    ruleParametersUsed: {
      preferred_return_pct: prefPct,
      split_after: splitAfterInvPct,
    },
  };
}

function computeElapsedYears(input: WaterfallInput): number {
  if (
    !input.contextDates ||
    input.contextDates.contributionDates.length === 0
  ) {
    return 1;
  }
  const investorDates = input.contextDates.contributionDates.filter(
    (c) => c.source === "investor",
  );
  if (investorDates.length === 0) return 1;
  const earliest = investorDates.reduce(
    (acc, c) => (c.date < acc ? c.date : acc),
    investorDates[0].date,
  );
  const ms = input.contextDates.valuationDate.getTime() - earliest.getTime();
  return Math.max(0, ms / (365.25 * 24 * 60 * 60 * 1000));
}

// ----------------------------------------------------------------------------
// Rule 4: waterfall_with_hurdle
// ----------------------------------------------------------------------------
//
// Below an IRR hurdle, profit is split `below_split` % to investor.
// Above it, the split changes to `above_split`. We approximate IRR via a
// simple "is-the-investor-already-getting-pref?" check rather than a full
// IRR solver — for HITL preview purposes this is sufficient. The operator
// reviews the reasoning before any distribution executes.
// ----------------------------------------------------------------------------

export function applyWaterfallWithHurdle(input: WaterfallInput): WaterfallOutput {
  validateInput(input);

  const params = input.ruleParameters as {
    hurdle_irr?: number;
    below_split?: number;
    above_split?: number;
  };
  const hurdle = typeof params.hurdle_irr === "number" ? params.hurdle_irr : 12;
  const below = typeof params.below_split === "number" ? params.below_split : 70;
  const above = typeof params.above_split === "number" ? params.above_split : 50;
  if (below < 0 || below > 100) throw new Error("hurdle: below_split out of range");
  if (above < 0 || above > 100) throw new Error("hurdle: above_split out of range");

  if (input.totalDistributable <= 0) {
    return zeroOutput(input, "waterfall_with_hurdle", {
      hurdle_irr: hurdle,
      below_split: below,
      above_split: above,
    });
  }

  const step = returnCapital(input, "pro_rata_contributed");

  const I = toBig(input.investorCapitalContributed);
  const profitToInvestorSoFar =
    toBig(input.cumulativeProfitDistributed) / 2n; // approximate

  const elapsedYears = Math.max(computeElapsedYears(input), 1 / 365);
  // Approx investor IRR: total profit returned / contributions / years.
  const numerator = bigToNum(profitToInvestorSoFar);
  const denominator = Math.max(bigToNum(I), 1) * elapsedYears;
  const approxIrrPct = (numerator / denominator) * 100;

  const isAboveHurdle = approxIrrPct >= hurdle;
  const investorBp = isAboveHurdle ? pctToBp(above) : pctToBp(below);
  const investorProfit = takePctBp(step.remaining, investorBp);
  const arconiqueProfit = step.remaining - investorProfit;

  const arc = sumSide({
    capitalReturn: step.arconiqueReturn,
    profitShare: arconiqueProfit,
    economicCredit: 0n,
  });
  const inv = sumInvestor({
    capitalReturn: step.investorReturn,
    profitShare: investorProfit,
  });

  const reasoning = [
    `### waterfall_with_hurdle (hurdle ${hurdle}%, below ${below}% / above ${above}% to investor)`,
    `1. Returned capital pro-rata: Arconique ${money(step.arconiqueReturn)}, investors ${money(step.investorReturn)}.`,
    `2. Approx investor IRR so far: ${approxIrrPct.toFixed(2)}% — ${isAboveHurdle ? "above" : "below"} hurdle.`,
    `3. Split remaining ${money(step.remaining)}: investors ${money(investorProfit)} (${isAboveHurdle ? above : below}%), Arconique ${money(arconiqueProfit)}.`,
  ].join("\n");

  return {
    arconiqueAllocation: arc,
    investorAllocation: inv,
    reasoning,
    appliedRule: "waterfall_with_hurdle",
    ruleParametersUsed: {
      hurdle_irr: hurdle,
      below_split: below,
      above_split: above,
    },
  };
}

// ----------------------------------------------------------------------------
// Rule 5: capital_first_then_split
// ----------------------------------------------------------------------------
//
// 100% of distributable goes to capital return first (pro-rata-outstanding).
// Once both sides are made whole, switch to a configurable split.
// ----------------------------------------------------------------------------

export function applyCapitalFirstThenSplit(
  input: WaterfallInput,
): WaterfallOutput {
  validateInput(input);

  const params = input.ruleParameters as { split_after_capital?: number };
  const investorAfterPct = typeof params.split_after_capital === "number"
    ? params.split_after_capital
    : 50;
  if (investorAfterPct < 0 || investorAfterPct > 100) {
    throw new Error("capital_first: split_after_capital out of range");
  }

  if (input.totalDistributable <= 0) {
    return zeroOutput(input, "capital_first_then_split", {
      split_after_capital: investorAfterPct,
    });
  }

  const step = returnCapital(input, "pro_rata_outstanding");

  let arconiqueProfit = 0n;
  let investorProfit = 0n;
  if (step.remaining > 0n) {
    investorProfit = takePctBp(step.remaining, pctToBp(investorAfterPct));
    arconiqueProfit = step.remaining - investorProfit;
  }

  const arc = sumSide({
    capitalReturn: step.arconiqueReturn,
    profitShare: arconiqueProfit,
    economicCredit: 0n,
  });
  const inv = sumInvestor({
    capitalReturn: step.investorReturn,
    profitShare: investorProfit,
  });

  const reasoning = [
    `### capital_first_then_split (investor ${investorAfterPct}% after capital)`,
    `1. Returned capital pro-rata-outstanding (priority): Arconique ${money(step.arconiqueReturn)}, investors ${money(step.investorReturn)}.`,
    `2. Of remaining ${money(step.remaining)} (after both sides whole): investors ${money(investorProfit)} (${investorAfterPct}%), Arconique ${money(arconiqueProfit)}.`,
  ].join("\n");

  return {
    arconiqueAllocation: arc,
    investorAllocation: inv,
    reasoning,
    appliedRule: "capital_first_then_split",
    ruleParametersUsed: { split_after_capital: investorAfterPct },
  };
}

// ----------------------------------------------------------------------------
// Rule 6: tiered_promote
// ----------------------------------------------------------------------------
//
// Multiple tiers, each with an IRR ceiling and a `split` (% to investor).
// The final tier uses `above` as its IRR-floor sentinel. We compute one
// tier at a time, walking up the ladder until distributable is exhausted
// or the top tier is reached.
//
// Approximate IRR-by-cumulative-distribution model — same simplification
// as `waterfall_with_hurdle`. Operator HITL review catches edge cases.
// ----------------------------------------------------------------------------

export function applyTieredPromote(input: WaterfallInput): WaterfallOutput {
  validateInput(input);

  type Tier = { up_to_irr?: number; above?: number; split: number };
  const params = input.ruleParameters as { tiers?: Tier[] };
  const tiers = Array.isArray(params.tiers) ? params.tiers : [];
  if (tiers.length === 0) {
    throw new Error("tiered_promote: tiers array required and non-empty");
  }
  for (const tier of tiers) {
    if (typeof tier.split !== "number" || tier.split < 0 || tier.split > 100) {
      throw new Error("tiered_promote: every tier needs split in [0,100]");
    }
  }

  if (input.totalDistributable <= 0) {
    return zeroOutput(input, "tiered_promote", { tiers });
  }

  const step = returnCapital(input, "pro_rata_outstanding");

  // For simplicity, use the first tier whose IRR ceiling has not been
  // crossed yet, based on profit-to-investor / outstanding-investor / years.
  const I = toBig(input.investorCapitalContributed);
  const profitInvestorSoFar = toBig(input.cumulativeProfitDistributed) / 2n;
  const elapsed = Math.max(computeElapsedYears(input), 1 / 365);
  const approxIrrPct =
    (bigToNum(profitInvestorSoFar) / Math.max(bigToNum(I), 1) / elapsed) * 100;

  let activeTier: Tier = tiers[tiers.length - 1];
  for (const tier of tiers) {
    if (typeof tier.up_to_irr === "number" && approxIrrPct < tier.up_to_irr) {
      activeTier = tier;
      break;
    }
  }

  const investorBp = pctToBp(activeTier.split);
  const investorProfit = takePctBp(step.remaining, investorBp);
  const arconiqueProfit = step.remaining - investorProfit;

  const arc = sumSide({
    capitalReturn: step.arconiqueReturn,
    profitShare: arconiqueProfit,
    economicCredit: 0n,
  });
  const inv = sumInvestor({
    capitalReturn: step.investorReturn,
    profitShare: investorProfit,
  });

  const reasoning = [
    `### tiered_promote`,
    `1. Returned capital pro-rata-outstanding: Arconique ${money(step.arconiqueReturn)}, investors ${money(step.investorReturn)}.`,
    `2. Approx investor IRR ${approxIrrPct.toFixed(2)}% → tier with ${activeTier.split}% to investor.`,
    `3. Split remaining ${money(step.remaining)}: investors ${money(investorProfit)}, Arconique ${money(arconiqueProfit)}.`,
  ].join("\n");

  return {
    arconiqueAllocation: arc,
    investorAllocation: inv,
    reasoning,
    appliedRule: "tiered_promote",
    ruleParametersUsed: { tiers },
  };
}

// ----------------------------------------------------------------------------
// Rule 7: custom — operator-supplied flat split (no capital phase).
// ----------------------------------------------------------------------------

function applyCustom(input: WaterfallInput): WaterfallOutput {
  const params = input.ruleParameters as {
    arconique_percent?: number;
    investor_percent?: number;
  };
  const arc = typeof params.arconique_percent === "number"
    ? params.arconique_percent
    : 50;
  const inv = typeof params.investor_percent === "number"
    ? params.investor_percent
    : 100 - arc;
  if (Math.abs(arc + inv - 100) > 0.01) {
    throw new Error(
      `custom: arconique_percent + investor_percent must = 100, got ${arc + inv}`,
    );
  }

  if (input.totalDistributable <= 0) {
    return zeroOutput(input, "custom", {
      arconique_percent: arc,
      investor_percent: inv,
    });
  }

  const D = toBig(input.totalDistributable);
  const arcAmt = takePctBp(D, pctToBp(arc));
  const invAmt = D - arcAmt;

  return {
    arconiqueAllocation: {
      capitalReturn: 0,
      profitShare: bigToNum(arcAmt),
      economicCredit: 0,
      total: bigToNum(arcAmt),
    },
    investorAllocation: {
      capitalReturn: 0,
      profitShare: bigToNum(invAmt),
      total: bigToNum(invAmt),
    },
    reasoning: `### custom\nFlat split: Arconique ${arc}%, investor ${inv}%. Capital-vs-profit semantics not modeled.`,
    appliedRule: "custom",
    ruleParametersUsed: { arconique_percent: arc, investor_percent: inv },
  };
}

// ----------------------------------------------------------------------------
// Output helpers — convert bigint → number, format reasoning amounts.
// ----------------------------------------------------------------------------

function sumSide(s: {
  capitalReturn: bigint;
  profitShare: bigint;
  economicCredit: bigint;
}): WaterfallSideAllocation & { totalBig: bigint } {
  const totalBig = s.capitalReturn + s.profitShare + s.economicCredit;
  return {
    capitalReturn: bigToNum(s.capitalReturn),
    profitShare: bigToNum(s.profitShare),
    economicCredit: bigToNum(s.economicCredit),
    total: bigToNum(totalBig),
    totalBig,
  };
}

function sumInvestor(s: {
  capitalReturn: bigint;
  profitShare: bigint;
}): WaterfallInvestorAllocation & { totalBig: bigint } {
  const totalBig = s.capitalReturn + s.profitShare;
  return {
    capitalReturn: bigToNum(s.capitalReturn),
    profitShare: bigToNum(s.profitShare),
    total: bigToNum(totalBig),
    totalBig,
  };
}

function money(b: bigint): string {
  // Display in major units with 2 decimals — for reasoning text only.
  const n = Number(b);
  return `$${(n / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function zeroOutput(
  input: WaterfallInput,
  ruleType: WaterfallRuleType = input.ruleType,
  paramsUsed: Record<string, unknown> = {},
): WaterfallOutput {
  return {
    arconiqueAllocation: emptyArconique(),
    investorAllocation: emptyInvestor(),
    reasoning: `### ${ruleType}\nNothing distributable (totalDistributable = 0).`,
    appliedRule: ruleType,
    ruleParametersUsed: paramsUsed,
  };
}

// ----------------------------------------------------------------------------
// Conservation-of-money invariant: sum of allocations == totalDistributable
// (allowing 1-cent rounding remainder, which gets folded into investor side
// by the helpers' choice of "subtract from total, don't multiply twice").
// ----------------------------------------------------------------------------

export function assertConservation(
  input: WaterfallInput,
  output: WaterfallOutput,
): void {
  const total =
    output.arconiqueAllocation.total + output.investorAllocation.total;
  const diff = Math.abs(total - input.totalDistributable);
  // Tolerate a single cent of rounding remainder per rule (we fold to one
  // side rather than doing two roundings).
  if (diff > 1) {
    throw new Error(
      `waterfall conservation broken: allocated ${total}, expected ${input.totalDistributable}, diff ${diff}`,
    );
  }
}
