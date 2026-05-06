import "server-only";

import { getCashFlowSummary } from "./transactions";

export interface SelfSustainingResult {
  projectId: string;
  isThresholdMet: boolean;
  netCashFlowUsdMinor: string;
  inflowUsdMinor: string;
  outflowUsdMinor: string;
  evaluationPeriodDays: number;
  evaluatedAt: string;
}

const DEFAULT_WINDOW_DAYS = 90;

/**
 * A project is "self-sustaining" once net cash flow over a rolling 90-day
 * window is positive. See architecture doc §"Self-Sustaining Threshold"
 * for the operational definition.
 *
 * Excluded from the calculation:
 *   - drawdown receipts (capital, not earnings) — `getCashFlowSummary` skips
 *     transactions with `related_drawdown_id IS NOT NULL`
 *   - corporate-event-tagged categories (director loans, dividends) — same query
 */
export async function evaluateSelfSustainingThreshold(
  projectId: string,
  options: { windowDays?: number; asOf?: Date } = {},
): Promise<SelfSustainingResult> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const asOf = options.asOf ?? new Date();
  const fromDate = new Date(asOf);
  fromDate.setDate(fromDate.getDate() - windowDays);

  const fromIso = fromDate.toISOString().slice(0, 10);
  const toIso = asOf.toISOString().slice(0, 10);
  const summary = await getCashFlowSummary(projectId, fromIso, toIso);

  const net = BigInt(summary.netUsdMinor);

  return {
    projectId,
    isThresholdMet: net > 0n,
    netCashFlowUsdMinor: summary.netUsdMinor,
    inflowUsdMinor: summary.inflowUsdMinor,
    outflowUsdMinor: summary.outflowUsdMinor,
    evaluationPeriodDays: windowDays,
    evaluatedAt: asOf.toISOString(),
  };
}
