import "server-only";

import { getDb } from "@/lib/db/client";
import { executiveMetricsSnapshots } from "@/lib/db/schema/executive";
import {
  composeExecutiveSnapshot,
  type ComposeSnapshotInput,
} from "./metrics-aggregator";

/**
 * Persist a snapshot row from a composed aggregation.
 *
 * Cron job and on-demand action both flow through here; the heavy
 * gathering of source data lives in the cron job (queries against
 * Stage 4–5.B tables) — this function is the write path.
 */
export async function persistExecutiveSnapshot(args: {
  snapshotType: "daily" | "weekly_summary" | "monthly_summary" | "on_demand";
  composed: ComposeSnapshotInput;
  computationDurationMs: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };

  const c = composeExecutiveSnapshot(args.composed);

  try {
    const inserted = await db
      .insert(executiveMetricsSnapshots)
      .values({
        snapshotType: args.snapshotType,
        scope: c.scope,
        projectId: c.projectId,

        totalCashOnHandMinor: BigInt(c.cash.totalCashOnHandMinor),
        cashByAccount: c.cash.cashByAccount,
        cashInIdrEquivalentMinor: BigInt(c.cash.cashInIdrEquivalentMinor),

        totalReceivablesMinor: BigInt(c.receivables.totalReceivablesMinor),
        receivablesAging: c.receivables.aging,

        totalPayablesMinor: BigInt(c.payables.totalPayablesMinor),
        payablesDueNext30DaysMinor: BigInt(
          c.payables.payablesDueNext30DaysMinor,
        ),
        payablesOverdueMinor: BigInt(c.payables.payablesOverdueMinor),

        taxPayableMinor: BigInt(c.taxPayableMinor),
        unclassifiedTransactionsCount: c.unclassifiedTransactionsCount,

        activeProjectsCount: c.projectCounts.activeProjectsCount,
        projectsOnTrack: c.projectCounts.projectsOnTrack,
        projectsAtRisk: c.projectCounts.projectsAtRisk,
        projectsDelayed: c.projectCounts.projectsDelayed,

        activeLeadsCount: c.pipeline.activeLeadsCount,
        hotLeadsCount: c.pipeline.hotLeadsCount,
        reservationsCount: c.pipeline.reservationsCount,
        contractsSignedThisMonth: c.contractsSignedThisMonth,
        totalPipelineValueMinor: BigInt(c.pipeline.totalPipelineValueMinor),

        totalCommittedCapitalMinor: BigInt(
          c.investorCapital.totalCommittedCapitalMinor,
        ),
        totalDrawnCapitalMinor: BigInt(
          c.investorCapital.totalDrawnCapitalMinor,
        ),
        pendingDistributionMinor: BigInt(c.pendingDistributionMinor),
        pendingInvestorRequestsCount: c.pendingInvestorRequestsCount,

        openQaQcIssues: c.openQaQcIssues,
        criticalQaQcIssues: c.criticalQaQcIssues,
        pendingChangeOrders: c.pendingChangeOrders,
        highRiskItemsCount: c.highRiskItemsCount,
        lowStockItemsCount: c.lowStockItemsCount,

        totalCommittedBudgetMinor: BigInt(
          c.budgetBurn.totalCommittedBudgetMinor,
        ),
        totalActualSpendMinor: BigInt(c.budgetBurn.totalActualSpendMinor),
        budgetBurnPercentage: c.budgetBurn.budgetBurnPercentage.toFixed(2),
        blendedMarginPercentage:
          c.blendedMarginPercentage != null
            ? c.blendedMarginPercentage.toFixed(4)
            : null,

        payrollRunwayWeeks: c.forecast.payrollRunwayWeeks.toFixed(2),
        cashAt30DaysMinor: BigInt(c.forecast.cashAt30DaysMinor),
        cashAt60DaysMinor: BigInt(c.forecast.cashAt60DaysMinor),
        cashAt90DaysMinor: BigInt(c.forecast.cashAt90DaysMinor),
        identifiedCashGapsCount: c.forecast.identifiedCashGapsCount,

        baseCurrency: c.baseCurrency,
        fxSnapshot: c.fxSnapshot,

        computationDurationMs: args.computationDurationMs,
      })
      .returning({ id: executiveMetricsSnapshots.id });

    return { ok: true, id: inserted[0].id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}
