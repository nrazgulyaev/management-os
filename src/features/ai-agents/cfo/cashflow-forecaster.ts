/**
 * Phase 2.2 dev-02 — cashflow-forecaster agent (stub).
 *
 * Daily run. Walks the org's projects, sums committed inflows
 * (capital calls + sales receipts) against committed outflows
 * (BOQ-loaded WP plan + payroll + opex), produces a 12-month
 * rolling forecast, and refreshes `cashflow_forecasts` (a
 * materialized view in the data PR).
 */

export interface CashflowForecasterInput {
  organizationId: string;
  /** Month to project from (ISO YYYY-MM). Defaults to current. */
  asOfMonth?: string;
}

export interface CashflowForecasterOutput {
  /** 12 entries — month / net / cumulative. */
  months: { month: string; netUsdMinor: bigint; cumulativeUsdMinor: bigint }[];
  /** Detected risk: cash dips below threshold X months out. */
  riskMonthsOut?: number;
}

export async function run(_input: CashflowForecasterInput): Promise<CashflowForecasterOutput> {
  return { months: [] };
}

export const CASHFLOW_FORECASTER_AGENT = {
  agentCode: "cashflow-forecaster",
  cron: "0 6 * * *",
  description: "Refreshes the org-wide 12-month cashflow forecast each morning.",
} as const;
