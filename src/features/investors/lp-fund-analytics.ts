/**
 * INVESTOR PORTAL — fund-level analytics (pure, server-only-free).
 *
 * The LP-facing headline an Attio/Carta-style investor portal leads
 * with: Gross / Net IRR, MOIC, DPI, TVPI vs a target hurdle, plus an
 * XIRR computed over the LP's *exact dated cashflows* (capital calls
 * out, distributions in, residual NAV as a terminal value).
 *
 * Pure module — no "server-only", no getDb — so the math is unit-
 * testable in isolation (mirrors src/features/investors/lp-gp-economics.ts
 * + statement-anomaly-rules.ts). The server query layer
 * (src/lib/development/server/investor/fund-analytics-queries.ts) feeds
 * it dated cents and the component formats the result.
 *
 * MONEY DISCIPLINE
 *   - Inputs arrive as bigint MINOR units (USD cents) on EXACT dates.
 *   - XIRR runs on cents-derived major units; we divide by 100 at the
 *     XIRR boundary only (no float money is persisted).
 *   - Sign convention is the *LP's* perspective:
 *       capital call paid in  → negative (cash leaves the LP)
 *       distribution received → positive (cash returns to the LP)
 *       residual NAV today    → positive terminal (unrealised value)
 *
 * This is deliberately distinct from the wallet-perspective
 * `getMyIRR` in src/lib/investor-portal/queries.ts (which dates off
 * wallet_transactions). Here we read the canonical LP cashflow source:
 * capital_drawdowns (calls) + distribution_allocations (distributions).
 */

import { computeXIRR, type CashFlow } from "./irr-tracker";

/** A single dated LP cashflow in USD MINOR units (cents). */
export interface DatedCashflowMinor {
  /** ISO date (YYYY-MM-DD), the value-date the cash actually moved. */
  date: string;
  /**
   * Signed amount in cents from the LP's perspective:
   * negative = capital called (paid in), positive = distribution
   * received. Residual NAV is supplied separately.
   */
  amountMinor: bigint;
  kind: "call" | "distribution";
}

export interface LpFundAnalyticsInput {
  /** Dated LP cashflows (calls negative, distributions positive). */
  cashflows: DatedCashflowMinor[];
  /**
   * Residual unrealised value attributable to the LP today, USD MINOR.
   * For a development fund this is the LP's residual wallet balance
   * (cash already attributed but not yet withdrawn). Defaults to 0n.
   */
  residualNavMinor?: bigint;
  /** Date the residual NAV is measured. Defaults to "today". */
  navAt?: string;
  /**
   * Target / hurdle IRR as a fraction (0.08 = 8%). Drives the
   * "vs target" delta. Defaults to the canonical 8% preferred return.
   */
  targetIrr?: number;
}

export interface LpFundAnalytics {
  /** True when there are no contributions yet — render the empty state. */
  isEmpty: boolean;

  // --- absolute money (cents) ---
  contributedMinor: bigint;
  distributedMinor: bigint;
  residualNavMinor: bigint;

  // --- multiples ---
  /** Distributions ÷ contributions (realised cash-on-cash). */
  dpi: number;
  /** (Distributions + residual NAV) ÷ contributions. */
  tvpi: number;
  /** Total Value to Paid-In; MOIC is the same total-value multiple here. */
  moic: number;

  // --- rates ---
  /**
   * Gross IRR — XIRR over realised distributions + residual NAV, with
   * NO fee/carry drag removed (the cashflows are already net of the
   * fund's internal mechanics at the LP level, so for a single-LP view
   * gross == net unless a separate fee stream is modelled). Kept as a
   * distinct field so the headline can show both rows.
   */
  grossIrr: number | null;
  /** Net IRR — XIRR over the LP's actual dated cashflows + residual. */
  netIrr: number | null;
  /** Target / hurdle IRR (fraction). */
  targetIrr: number;
  /** netIrr − targetIrr (fraction); null when netIrr is null. */
  vsTarget: number | null;

  /** The dated flows actually fed to XIRR (for transparency / tooltip). */
  flowCount: number;
}

const sumAbs = (flows: DatedCashflowMinor[], kind: DatedCashflowMinor["kind"]): bigint =>
  flows
    .filter((f) => f.kind === kind)
    .reduce((acc, f) => acc + (f.amountMinor < 0n ? -f.amountMinor : f.amountMinor), 0n);

const minorToMajor = (cents: bigint): number => Number(cents) / 100;

/**
 * Compute the LP's fund-level analytics from exact dated cashflows.
 *
 * XIRR is computed on the full dated series (calls + distributions +
 * a terminal residual-NAV inflow at `navAt`). Multiples use absolute
 * contributed / distributed / residual cents so they're exact ratios.
 */
export function computeLpFundAnalytics(
  input: LpFundAnalyticsInput,
): LpFundAnalytics {
  const targetIrr = input.targetIrr ?? 0.08;
  const residualNavMinor = input.residualNavMinor ?? 0n;
  const navAt = input.navAt ?? new Date().toISOString().slice(0, 10);

  const contributedMinor = sumAbs(input.cashflows, "call");
  const distributedMinor = sumAbs(input.cashflows, "distribution");

  if (contributedMinor === 0n) {
    return {
      isEmpty: true,
      contributedMinor: 0n,
      distributedMinor,
      residualNavMinor,
      dpi: 0,
      tvpi: 0,
      moic: 0,
      grossIrr: null,
      netIrr: null,
      targetIrr,
      vsTarget: null,
      flowCount: 0,
    };
  }

  const dpi = minorToMajor(distributedMinor) / minorToMajor(contributedMinor);
  const totalValueMinor = distributedMinor + residualNavMinor;
  const tvpi = minorToMajor(totalValueMinor) / minorToMajor(contributedMinor);
  const moic = tvpi;

  // Build the dated XIRR series, sorted by date so the anchor is the
  // earliest cashflow. Calls are already negative, distributions
  // positive; we append the residual NAV as a terminal inflow.
  const flows: CashFlow[] = input.cashflows.map((f) => ({
    date: f.date,
    amount: minorToMajor(f.amountMinor),
  }));
  if (residualNavMinor > 0n) {
    flows.push({ date: navAt, amount: minorToMajor(residualNavMinor) });
  }
  flows.sort((a, b) => a.date.localeCompare(b.date));

  const netIrr = computeXIRR(flows);
  // Gross IRR over realised + residual: identical series at the single-
  // LP level (no separate fee stream is modelled on the LP cashflows),
  // so gross == net here. Kept distinct so the surface can show both
  // and a future fee-stream model can diverge them in one place.
  const grossIrr = netIrr;

  return {
    isEmpty: false,
    contributedMinor,
    distributedMinor,
    residualNavMinor,
    dpi,
    tvpi,
    moic,
    grossIrr,
    netIrr,
    targetIrr,
    vsTarget: netIrr === null ? null : netIrr - targetIrr,
    flowCount: flows.length,
  };
}
