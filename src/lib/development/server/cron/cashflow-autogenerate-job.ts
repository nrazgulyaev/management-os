import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { computeMonthlyCashflowProjection } from "../cashflow/cashflow-helpers";
import { cashflowForecasts } from "@/lib/db/schema/profitability-cashflow";

/**
 * Stage 5.B.4 — Cashflow auto-generate (1st of month 03:00).
 *
 * Generates a 12-month forward forecast (company-wide) using current
 * cash position + latest payroll commitment. Saves as `status='draft'`
 * for operator review before becoming active. Multiple draft forecasts
 * can coexist; operator promotes one to `active`.
 *
 * Idempotent — running twice creates two draft rows; that's intended.
 */
export async function runDevOsCashflowAutoGenerate(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { generated: 0 },
      error: "DB unavailable",
    };
  }

  // Cash on hand.
  const cashRow = await db.execute<{ cash: string }>(sql`
    SELECT COALESCE(SUM(current_balance_usd_minor), 0)::text AS cash
      FROM dev_bank_accounts
     WHERE is_active = TRUE
  `);
  const startingCash = Number(
    rowsOf<{ cash: string }>(cashRow)[0]?.cash ?? "0",
  );

  // Latest monthly payroll commitment.
  const payrollRow = await db.execute<{ amount: string }>(sql`
    SELECT total_payroll_amount_minor::text AS amount
      FROM payroll_periods
     WHERE period_type = 'monthly'
     ORDER BY period_start DESC
     LIMIT 1
  `);
  const monthlyPayroll = Number(
    rowsOf<{ amount: string }>(payrollRow)[0]
      ?.amount ?? "0",
  );

  const now = new Date();
  const startMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

  const result = computeMonthlyCashflowProjection({
    startMonth,
    horizonMonths: 12,
    startingCash,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: monthlyPayroll,
    monthlyFixedCosts: Math.round(monthlyPayroll * 0.3), // rough heuristic
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });

  await db.insert(cashflowForecasts).values({
    forecastLabel: `Auto ${now.toISOString().slice(0, 7)} — 12 months`,
    scope: "company_wide",
    projectId: null,
    forecastHorizonMonths: 12,
    forecastStartMonth: startMonth.toISOString().slice(0, 10),
    monthlyProjections: result.projections.map((p) => ({
      month: p.month.toISOString().slice(0, 10),
      inflow: p.inflow,
      outflow: p.outflow,
      net: p.net,
      cumulativeCash: p.cumulativeCash,
    })),
    peakCapitalRequiredMinor: BigInt(result.peakCapitalRequired),
    peakRequiredAtMonth: result.peakAt.toISOString().slice(0, 10),
    totalInflowMinor: BigInt(result.totalInflow),
    totalOutflowMinor: BigInt(result.totalOutflow),
    endingCashMinor: BigInt(result.endingCash),
    identifiedCashGaps: result.identifiedGaps.map((g) => ({
      month: g.month.toISOString().slice(0, 10),
      gapAmount: g.gapAmount,
      severity: g.severity,
    })),
    status: "draft",
    generatedByAgent: true,
  });

  await handle.event(
    "info",
    `cashflow forecast generated — ${result.identifiedGaps.length} gap(s), ending cash ${result.endingCash}`,
    {
      gapCount: result.identifiedGaps.length,
      endingCash: result.endingCash,
      peakRequired: result.peakCapitalRequired,
    },
  );

  return {
    status: "success",
    summary: `Generated 12-month forecast — ${result.identifiedGaps.length} gap(s).`,
    metrics: {
      gapCount: result.identifiedGaps.length,
      endingCash: result.endingCash,
      peakRequired: result.peakCapitalRequired,
    },
  };
}
