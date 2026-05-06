/**
 * Stage 5.C — Executive Command Center tests.
 *
 * Mix of:
 *   - Migration shape tests (0060)
 *   - Schema export tests
 *   - Pure helper tests:
 *     - metrics-aggregator (cash, receivables, payables, projects, pipeline, capital, budget)
 *     - widgets-helpers (trend math, formatting, widget builders)
 *     - chart-data-helpers (axis range, scale, formatting, escape)
 *     - cashflow-waterfall-helpers
 *     - s-curve-helpers
 *     - burn-chart-helpers
 *     - heatmap-helpers
 *     - funnel-helpers
 *     - capital-timeline-helpers
 *     - productivity-helpers
 *     - procurement-delays-helpers
 *     - risk-radar-detector (7 rules + dedupe + recurring)
 *     - digest-helpers (skeleton + code)
 *   - Cron + dispatcher + route audit (55 routes)
 *   - Sidebar audit (EXECUTIVE group)
 *   - Demo seed audit (Stage 5.C section)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeCashPosition,
  computeReceivablesAging,
  computePayablesBuckets,
  computeProjectStatusCounts,
  computePipeline,
  computeInvestorCapital,
  computeBudgetBurn,
  composeExecutiveSnapshot,
} from "../src/lib/development/server/executive/metrics-aggregator";
import {
  trendOf,
  trendDeltaPct,
  formatMinorAsCurrency,
  buildCashOnHandWidget,
  buildReceivablesAgingWidget,
  buildProjectsHealthWidget,
  buildBudgetBurnWidget,
  buildSalesPipelineWidget,
  buildInvestorCapitalWidget,
  buildQaQcWidget,
  buildPayrollRunwayWidget,
} from "../src/lib/development/server/executive/widgets-helpers";
import {
  computeAxisRange,
  scaleY,
  scaleXIndex,
  scaleXValue,
  formatAxisLabel,
  escapeSvg,
} from "../src/lib/development/server/visual-reports/chart-data-helpers";
import {
  computeWaterfallSteps,
  renderWaterfallSvg,
} from "../src/lib/development/server/visual-reports/cashflow-waterfall-helpers";
import {
  buildSCurvePoints,
  interpolatePlannedSCurve,
  renderSCurveSvg,
} from "../src/lib/development/server/visual-reports/s-curve-helpers";
import {
  buildBurnPoints,
  renderBurnChartSvg,
} from "../src/lib/development/server/visual-reports/burn-chart-helpers";
import {
  computeOveragePct,
  colorForOverage,
  computeHeatmapCells,
  renderHeatmapSvg,
} from "../src/lib/development/server/visual-reports/heatmap-helpers";
import {
  computeFunnelStages,
  renderFunnelSvg,
} from "../src/lib/development/server/visual-reports/funnel-helpers";
import {
  totalsByMonth,
  renderCapitalTimelineSvg,
} from "../src/lib/development/server/visual-reports/capital-timeline-helpers";
import {
  computeProductivitySeries,
  renderProductivitySvg,
} from "../src/lib/development/server/visual-reports/productivity-helpers";
import {
  computeSupplierDelays,
  rankSuppliers,
} from "../src/lib/development/server/visual-reports/procurement-delays-helpers";
import {
  ruleInvoiceWithoutPo,
  ruleTransactionMissingTax,
  rulePrWithoutDelivery,
  ruleHotLeadStale,
  ruleScheduleTaskOverdue,
  ruleCashGapForecast,
  ruleBudgetOverrun,
  dedupeAgainstOpen,
  detectRecurringPatterns,
} from "../src/lib/development/server/risk-radar/risk-radar-detector";
import {
  buildDigestSkeleton,
  nextDigestCode,
} from "../src/lib/development/server/executive-digest/digest-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0060 = "drizzle/0060_development_os_stage_5_c_executive.sql";

// ===========================================================================
// 1) Migration 0060 — shape
// ===========================================================================

test("migration 0060 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0060));
  const sql = read(MIG_0060);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0060 creates executive_metrics_snapshots", () => {
  const sql = read(MIG_0060);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "executive_metrics_snapshots"/);
});

test("migration 0060 snapshot_type enum has 4 values", () => {
  const sql = read(MIG_0060);
  for (const v of ["daily", "weekly_summary", "monthly_summary", "on_demand"]) {
    assert.ok(sql.includes(`'${v}'`), `snapshot_type '${v}' missing`);
  }
});

test("migration 0060 scope enum has company_wide + project", () => {
  const sql = read(MIG_0060);
  assert.match(sql, /'company_wide'/);
  assert.match(sql, /'project'/);
});

test("migration 0060 snapshots has all cash/receivable/payable columns", () => {
  const sql = read(MIG_0060);
  for (const c of [
    "total_cash_on_hand_minor",
    "cash_by_account",
    "cash_in_idr_equivalent_minor",
    "total_receivables_minor",
    "receivables_aging",
    "total_payables_minor",
    "payables_due_next_30_days_minor",
    "payables_overdue_minor",
  ]) {
    assert.ok(sql.includes(c), `${c} missing`);
  }
});

test("migration 0060 snapshots has project + pipeline + investor columns", () => {
  const sql = read(MIG_0060);
  for (const c of [
    "active_projects_count",
    "projects_on_track",
    "projects_at_risk",
    "projects_delayed",
    "active_leads_count",
    "hot_leads_count",
    "total_pipeline_value_minor",
    "total_committed_capital_minor",
    "total_drawn_capital_minor",
  ]) {
    assert.ok(sql.includes(c), `${c} missing`);
  }
});

test("migration 0060 snapshots has forecast columns", () => {
  const sql = read(MIG_0060);
  for (const c of [
    "payroll_runway_weeks",
    "cash_at_30_days_minor",
    "cash_at_60_days_minor",
    "cash_at_90_days_minor",
    "identified_cash_gaps_count",
  ]) {
    assert.ok(sql.includes(c), `${c} missing`);
  }
});

test("migration 0060 snapshots has fx_snapshot + base_currency", () => {
  const sql = read(MIG_0060);
  assert.match(sql, /"base_currency" TEXT NOT NULL DEFAULT 'IDR'/);
  assert.match(sql, /"fx_snapshot" JSONB/);
});

test("migration 0060 snapshots has 5 indexes", () => {
  const sql = read(MIG_0060);
  for (const idx of [
    "executive_metrics_snapshots_date_idx",
    "executive_metrics_snapshots_type_idx",
    "executive_metrics_snapshots_scope_idx",
    "executive_metrics_snapshots_project_idx",
    "executive_metrics_snapshots_latest_idx",
  ]) {
    assert.ok(sql.includes(idx), `${idx} missing`);
  }
});

test("migration 0060 creates risk_radar_alerts", () => {
  const sql = read(MIG_0060);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "risk_radar_alerts"/);
});

test("migration 0060 risk alerts has 13 categories", () => {
  const sql = read(MIG_0060);
  for (const c of [
    "cash_flow",
    "budget_overrun",
    "schedule_delay",
    "quality_issue",
    "investor_relations",
    "sales_pipeline",
    "compliance",
    "team_capacity",
    "data_health",
    "vendor_performance",
    "safety",
    "tax",
    "other",
  ]) {
    assert.ok(sql.includes(`'${c}'`), `category '${c}' missing`);
  }
});

test("migration 0060 risk alerts has 5 severity levels", () => {
  const sql = read(MIG_0060);
  for (const s of ["info", "low", "medium", "high", "critical"]) {
    assert.ok(sql.includes(`'${s}'`), `severity '${s}' missing`);
  }
});

test("migration 0060 risk alerts has 6 status values", () => {
  const sql = read(MIG_0060);
  for (const s of [
    "open",
    "acknowledged",
    "investigating",
    "resolved",
    "false_positive",
    "archived",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `status '${s}' missing`);
  }
});

test("migration 0060 risk alerts has alert_code UNIQUE", () => {
  const sql = read(MIG_0060);
  assert.match(sql, /"alert_code" TEXT UNIQUE NOT NULL/);
});

test("migration 0060 risk alerts has partial unique index for open alerts", () => {
  const sql = read(MIG_0060);
  assert.match(
    sql,
    /risk_radar_alerts_open_idx[\s\S]*?WHERE "status" IN \('open', 'acknowledged', 'investigating'\)/,
  );
});

test("migration 0060 creates executive_digests", () => {
  const sql = read(MIG_0060);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "executive_digests"/);
});

test("migration 0060 digest_type enum has 4 values", () => {
  const sql = read(MIG_0060);
  for (const v of ["weekly", "monthly", "quarterly", "on_demand"]) {
    assert.ok(sql.includes(`'${v}'`), `digest_type '${v}' missing`);
  }
});

test("migration 0060 digest status enum has 5 values", () => {
  const sql = read(MIG_0060);
  for (const s of [
    "draft",
    "under_review",
    "approved",
    "distributed",
    "archived",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `status '${s}' missing`);
  }
});

test("migration 0060 digests has period CHECK", () => {
  const sql = read(MIG_0060);
  assert.match(sql, /CHECK \("period_end" >= "period_start"\)/);
});

test("migration 0060 enables RLS + internal_only policies", () => {
  const sql = read(MIG_0060);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 2) Schema exports
// ===========================================================================

test("schema/index exports new executive schema file", () => {
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/executive"/);
});

test("executive schema exports tables", async () => {
  const m = await import("../src/lib/db/schema/executive");
  assert.ok(m.executiveMetricsSnapshots);
  assert.ok(m.riskRadarAlerts);
  assert.ok(m.executiveDigests);
});

// ===========================================================================
// 3) metrics-aggregator pure helpers
// ===========================================================================

test("computeCashPosition: same currency is identity", () => {
  const r = computeCashPosition(
    [{ accountId: "A", accountName: "Main", balanceMinor: 100, currency: "IDR" }],
    "IDR",
    [],
  );
  assert.equal(r.totalCashOnHandMinor, 100);
  assert.equal(r.cashInIdrEquivalentMinor, 100);
});

test("computeCashPosition: USD converts via fx rate", () => {
  const r = computeCashPosition(
    [{ accountId: "A", accountName: "USD", balanceMinor: 100, currency: "USD" }],
    "IDR",
    [{ from: "USD", to: "IDR", rate: 16000 }],
  );
  assert.equal(r.cashInIdrEquivalentMinor, 1_600_000);
});

test("computeCashPosition: missing fx rate → 0 contribution", () => {
  const r = computeCashPosition(
    [{ accountId: "A", accountName: "USD", balanceMinor: 100, currency: "USD" }],
    "IDR",
    [],
  );
  assert.equal(r.cashInIdrEquivalentMinor, 0);
});

test("computeReceivablesAging: buckets correctly", () => {
  const r = computeReceivablesAging([
    { amountMinor: 100, daysOverdue: -5 },
    { amountMinor: 200, daysOverdue: 10 },
    { amountMinor: 300, daysOverdue: 45 },
    { amountMinor: 400, daysOverdue: 75 },
    { amountMinor: 500, daysOverdue: 120 },
  ]);
  assert.equal(r.aging.current, 100);
  assert.equal(r.aging.days_1_30, 200);
  assert.equal(r.aging.days_31_60, 300);
  assert.equal(r.aging.days_61_90, 400);
  assert.equal(r.aging.days_over_90, 500);
  assert.equal(r.totalReceivablesMinor, 1500);
});

test("computeReceivablesAging: empty → all zeros", () => {
  const r = computeReceivablesAging([]);
  assert.equal(r.totalReceivablesMinor, 0);
});

test("computePayablesBuckets: sorts overdue vs 30d", () => {
  const r = computePayablesBuckets([
    { amountMinor: 100, daysUntilDue: -5 },
    { amountMinor: 200, daysUntilDue: 10 },
    { amountMinor: 300, daysUntilDue: 60 },
  ]);
  assert.equal(r.payablesOverdueMinor, 100);
  assert.equal(r.payablesDueNext30DaysMinor, 200);
  assert.equal(r.totalPayablesMinor, 600);
});

test("computeProjectStatusCounts: completed/paused not active", () => {
  const r = computeProjectStatusCounts([
    { projectId: "1", status: "on_track" },
    { projectId: "2", status: "at_risk" },
    { projectId: "3", status: "delayed" },
    { projectId: "4", status: "completed" },
    { projectId: "5", status: "paused" },
  ]);
  assert.equal(r.activeProjectsCount, 3);
  assert.equal(r.projectsOnTrack, 1);
  assert.equal(r.projectsAtRisk, 1);
  assert.equal(r.projectsDelayed, 1);
});

test("computePipeline: sums total + counts hot/active/reservations", () => {
  const r = computePipeline([
    { status: "lead", estimatedValueMinor: 100 },
    { status: "hot", estimatedValueMinor: 200 },
    { status: "qualified", estimatedValueMinor: 300 },
    { status: "reservation", estimatedValueMinor: 400 },
    { status: "contract", estimatedValueMinor: 500 },
  ]);
  assert.equal(r.activeLeadsCount, 3);
  assert.equal(r.hotLeadsCount, 1);
  assert.equal(r.reservationsCount, 1);
  assert.equal(r.totalPipelineValueMinor, 1500);
});

test("computeInvestorCapital: drawnPct correct", () => {
  const r = computeInvestorCapital([
    { committedMinor: 1000, drawnMinor: 750 },
  ]);
  assert.equal(r.drawnPercentage, 75);
  assert.equal(r.availableCapitalMinor, 250);
});

test("computeInvestorCapital: zero committed → 0%", () => {
  const r = computeInvestorCapital([
    { committedMinor: 0, drawnMinor: 0 },
  ]);
  assert.equal(r.drawnPercentage, 0);
});

test("computeBudgetBurn: 50% burn", () => {
  const r = computeBudgetBurn({
    committedBudgetMinor: 1000,
    actualSpendMinor: 500,
  });
  assert.equal(r.budgetBurnPercentage, 50);
  assert.equal(r.remainingBudgetMinor, 500);
});

test("computeBudgetBurn: zero committed → 0%", () => {
  const r = computeBudgetBurn({
    committedBudgetMinor: 0,
    actualSpendMinor: 0,
  });
  assert.equal(r.budgetBurnPercentage, 0);
});

test("computeBudgetBurn: throws on non-finite", () => {
  assert.throws(() =>
    computeBudgetBurn({
      committedBudgetMinor: NaN,
      actualSpendMinor: 0,
    }),
  );
});

test("composeExecutiveSnapshot: returns all sub-shapes", () => {
  const r = composeExecutiveSnapshot({
    scope: "company_wide",
    projectId: null,
    baseCurrency: "IDR",
    fxRates: [],
    bankAccounts: [],
    receivables: [],
    payables: [],
    taxPayableMinor: 0,
    unclassifiedTransactionsCount: 0,
    projects: [],
    leads: [],
    contractsSignedThisMonth: 0,
    investorCommitments: [],
    pendingDistributionMinor: 0,
    pendingInvestorRequestsCount: 0,
    openQaQcIssues: 0,
    criticalQaQcIssues: 0,
    pendingChangeOrders: 0,
    highRiskItemsCount: 0,
    lowStockItemsCount: 0,
    budget: { committedMinor: 0, actualSpendMinor: 0 },
    blendedMarginPercentage: null,
    forecast: {
      payrollRunwayWeeks: 0,
      cashAt30DaysMinor: 0,
      cashAt60DaysMinor: 0,
      cashAt90DaysMinor: 0,
      identifiedCashGapsCount: 0,
    },
  });
  assert.equal(r.scope, "company_wide");
  assert.ok(r.cash);
  assert.ok(r.receivables);
  assert.ok(r.payables);
  assert.ok(r.budgetBurn);
});

test("composeExecutiveSnapshot: deterministic", () => {
  const input = {
    scope: "company_wide" as const,
    projectId: null,
    baseCurrency: "IDR",
    fxRates: [],
    bankAccounts: [
      { accountId: "A", accountName: "Main", balanceMinor: 1000, currency: "IDR" },
    ],
    receivables: [{ amountMinor: 500, daysOverdue: 10 }],
    payables: [],
    taxPayableMinor: 0,
    unclassifiedTransactionsCount: 0,
    projects: [{ projectId: "1", status: "on_track" as const }],
    leads: [],
    contractsSignedThisMonth: 0,
    investorCommitments: [],
    pendingDistributionMinor: 0,
    pendingInvestorRequestsCount: 0,
    openQaQcIssues: 0,
    criticalQaQcIssues: 0,
    pendingChangeOrders: 0,
    highRiskItemsCount: 0,
    lowStockItemsCount: 0,
    budget: { committedMinor: 0, actualSpendMinor: 0 },
    blendedMarginPercentage: null,
    forecast: {
      payrollRunwayWeeks: 0,
      cashAt30DaysMinor: 0,
      cashAt60DaysMinor: 0,
      cashAt90DaysMinor: 0,
      identifiedCashGapsCount: 0,
    },
  };
  const r1 = composeExecutiveSnapshot(input);
  const r2 = composeExecutiveSnapshot(input);
  assert.deepEqual(r1, r2);
});

// ===========================================================================
// 4) widgets-helpers
// ===========================================================================

test("trendOf: previous=0 + current>0 → up", () => {
  assert.equal(trendOf(100, 0), "up");
});

test("trendOf: previous=0 + current=0 → flat", () => {
  assert.equal(trendOf(0, 0), "flat");
});

test("trendOf: under 1% threshold → flat", () => {
  assert.equal(trendOf(100.5, 100), "flat");
  assert.equal(trendOf(102, 100), "up");
});

test("trendOf: down trend", () => {
  assert.equal(trendOf(80, 100), "down");
});

test("trendDeltaPct: pct from previous", () => {
  assert.equal(trendDeltaPct(150, 100), 50);
  assert.equal(trendDeltaPct(50, 100), -50);
  assert.equal(trendDeltaPct(100, 0), 0);
});

test("formatMinorAsCurrency: IDR formats large amounts", () => {
  const v = formatMinorAsCurrency(5_000_000_000_00, "IDR");
  assert.match(v, /Rp 5\.0B/);
});

test("formatMinorAsCurrency: USD formats large amounts", () => {
  const v = formatMinorAsCurrency(1_500_000_00, "USD");
  assert.match(v, /\$1\.5M/);
});

test("formatMinorAsCurrency: small IDR", () => {
  assert.equal(formatMinorAsCurrency(50_000, "IDR"), "Rp 500");
});

test("formatMinorAsCurrency: unknown currency", () => {
  const v = formatMinorAsCurrency(10000, "EUR");
  assert.match(v, /EUR 100/);
});

test("buildCashOnHandWidget: trend up vs lower previous", () => {
  const w = buildCashOnHandWidget(
    { totalCashOnHandMinor: 1000, baseCurrency: "IDR" },
    { totalCashOnHandMinor: 500 },
  );
  assert.equal(w.trend, "up");
  assert.equal(w.numericValue, 1000);
});

test("buildReceivablesAgingWidget: total = sum of buckets", () => {
  const w = buildReceivablesAgingWidget({
    current: 100,
    days_1_30: 200,
    days_31_60: 300,
    days_61_90: 400,
    days_over_90: 500,
    baseCurrency: "IDR",
  });
  assert.equal(w.numericValue, 1500);
  assert.equal(w.breakdown.length, 5);
});

test("buildProjectsHealthWidget: healthPct correct", () => {
  const w = buildProjectsHealthWidget({ onTrack: 8, atRisk: 1, delayed: 1 });
  assert.equal(w.healthPct, 80);
});

test("buildProjectsHealthWidget: empty → '—'", () => {
  const w = buildProjectsHealthWidget({ onTrack: 0, atRisk: 0, delayed: 0 });
  assert.equal(w.value, "—");
});

test("buildBudgetBurnWidget: % computed", () => {
  const w = buildBudgetBurnWidget({
    committedMinor: 1000,
    actualMinor: 750,
    baseCurrency: "IDR",
  });
  assert.equal(w.burnPct, 75);
});

test("buildSalesPipelineWidget: shows pipeline value", () => {
  const w = buildSalesPipelineWidget({
    totalPipelineValueMinor: 1_000_000_00,
    hotLeadsCount: 5,
    baseCurrency: "USD",
  });
  assert.equal(w.hotLeadsCount, 5);
  assert.match(w.value, /\$1\.0M/);
});

test("buildInvestorCapitalWidget: drawnPct = drawn/committed", () => {
  const w = buildInvestorCapitalWidget({
    committedMinor: 1000,
    drawnMinor: 600,
    baseCurrency: "IDR",
  });
  assert.equal(w.drawnPct, 60);
  assert.equal(w.availableMinor, 400);
});

test("buildQaQcWidget: trend up if critical", () => {
  const w = buildQaQcWidget({ open: 5, critical: 1 });
  assert.equal(w.trend, "up");
  assert.equal(w.critical, 1);
});

test("buildPayrollRunwayWidget: critical < 13 weeks", () => {
  const w = buildPayrollRunwayWidget({ weeks: 8 });
  assert.equal(w.riskLevel, "critical");
});

test("buildPayrollRunwayWidget: safe at 60+ weeks", () => {
  const w = buildPayrollRunwayWidget({ weeks: 60 });
  assert.equal(w.riskLevel, "safe");
});

// ===========================================================================
// 5) chart-data-helpers
// ===========================================================================

test("computeAxisRange: empty → 0..1", () => {
  const r = computeAxisRange([]);
  assert.equal(r.min, 0);
  assert.equal(r.max, 1);
});

test("computeAxisRange: nice ticks for 0..100", () => {
  const r = computeAxisRange([100], 5);
  assert.ok(r.max >= 100);
  assert.ok(r.ticks.length > 0);
});

test("computeAxisRange: includes zero", () => {
  const r = computeAxisRange([10, 20, 30], 5);
  assert.equal(r.min, 0);
});

test("scaleY: max value at top padding", () => {
  const range = computeAxisRange([0, 100], 5);
  const y = scaleY(range.max, range, 200);
  assert.ok(y >= 0 && y < 30);
});

test("scaleXIndex: first index at left padding", () => {
  const x = scaleXIndex(0, 5, 200);
  assert.equal(x, 40);
});

test("scaleXValue: maps middle of domain to middle of width", () => {
  const x = scaleXValue(50, 0, 100, 200, 0, 0);
  assert.equal(x, 100);
});

test("formatAxisLabel: large numbers with B suffix", () => {
  assert.match(formatAxisLabel(5_000_000_000_00), /5\.0B/);
});

test("escapeSvg: escapes & < > \"", () => {
  assert.equal(escapeSvg('a<b&c">'), "a&lt;b&amp;c&quot;&gt;");
});

// ===========================================================================
// 6) cashflow-waterfall-helpers
// ===========================================================================

test("computeWaterfallSteps: starting → in → out → ending", () => {
  const steps = computeWaterfallSteps([
    { label: "Start", amountMinor: 1000, kind: "starting" },
    { label: "In", amountMinor: 500, kind: "in" },
    { label: "Out", amountMinor: 200, kind: "out" },
    { label: "End", amountMinor: 1300, kind: "ending" },
  ]);
  assert.equal(steps.length, 4);
  assert.equal(steps[0].cumulativeMinor, 1000);
  assert.equal(steps[1].cumulativeMinor, 1500);
  assert.equal(steps[2].cumulativeMinor, 1300);
  assert.equal(steps[3].cumulativeMinor, 1300);
});

test("renderWaterfallSvg: empty bars renders no-data SVG", () => {
  const svg = renderWaterfallSvg([]);
  assert.match(svg, /<svg/);
  assert.match(svg, /No data/);
});

test("renderWaterfallSvg: includes bars + axis labels", () => {
  const svg = renderWaterfallSvg([
    { label: "Start", amountMinor: 1000, kind: "starting" },
    { label: "In", amountMinor: 500, kind: "in" },
  ]);
  assert.match(svg, /<rect/);
  assert.match(svg, /<text/);
});

// ===========================================================================
// 7) s-curve-helpers
// ===========================================================================

test("buildSCurvePoints: cumulative deltas, capped at 100", () => {
  const pts = buildSCurvePoints([
    { date: new Date("2026-01-01"), deltaPct: 30 },
    { date: new Date("2026-02-01"), deltaPct: 40 },
    { date: new Date("2026-03-01"), deltaPct: 50 },
  ]);
  assert.equal(pts[0].pctComplete, 30);
  assert.equal(pts[1].pctComplete, 70);
  assert.equal(pts[2].pctComplete, 100);
});

test("buildSCurvePoints: never goes below 0", () => {
  const pts = buildSCurvePoints([
    { date: new Date("2026-01-01"), deltaPct: -50 },
  ]);
  assert.equal(pts[0].pctComplete, 0);
});

test("interpolatePlannedSCurve: 30 samples by default", () => {
  const pts = interpolatePlannedSCurve(
    new Date("2026-01-01"),
    new Date("2026-12-31"),
    30,
  );
  assert.equal(pts.length, 30);
  assert.equal(pts[0].pctComplete, 0);
  assert.equal(pts[29].pctComplete, 100);
});

test("renderSCurveSvg: empty → no-data SVG", () => {
  const svg = renderSCurveSvg([], []);
  assert.match(svg, /No data/);
});

test("renderSCurveSvg: includes paths for planned and actual", () => {
  const planned = interpolatePlannedSCurve(
    new Date("2026-01-01"),
    new Date("2026-06-30"),
    10,
  );
  const actual = buildSCurvePoints([
    { date: new Date("2026-01-31"), deltaPct: 10 },
    { date: new Date("2026-02-28"), deltaPct: 20 },
  ]);
  const svg = renderSCurveSvg(planned, actual);
  assert.match(svg, /<path/);
});

// ===========================================================================
// 8) burn-chart-helpers
// ===========================================================================

test("buildBurnPoints: cumulative deltas", () => {
  const r = buildBurnPoints([
    { label: "Jan", committedDeltaMinor: 100, actualDeltaMinor: 50 },
    { label: "Feb", committedDeltaMinor: 200, actualDeltaMinor: 150 },
  ]);
  assert.equal(r[0].cumulativeCommittedMinor, 100);
  assert.equal(r[1].cumulativeCommittedMinor, 300);
  assert.equal(r[1].cumulativeActualMinor, 200);
});

test("renderBurnChartSvg: empty data → no-data svg", () => {
  const svg = renderBurnChartSvg([], { budgetMinor: 1000 });
  assert.match(svg, /No data/);
});

test("renderBurnChartSvg: includes budget reference line + bars", () => {
  const points = buildBurnPoints([
    { label: "Jan", committedDeltaMinor: 100, actualDeltaMinor: 50 },
  ]);
  const svg = renderBurnChartSvg(points, { budgetMinor: 1000 });
  assert.match(svg, /Budget/);
});

// ===========================================================================
// 9) heatmap-helpers
// ===========================================================================

test("computeOveragePct: 50% over", () => {
  const r = computeOveragePct({
    rowKey: "a",
    colKey: "b",
    budgetMinor: 100,
    actualMinor: 150,
  });
  assert.equal(r, 50);
});

test("computeOveragePct: 0 budget + 0 actual → 0", () => {
  const r = computeOveragePct({
    rowKey: "a",
    colKey: "b",
    budgetMinor: 0,
    actualMinor: 0,
  });
  assert.equal(r, 0);
});

test("computeOveragePct: 0 budget but non-zero actual → 100", () => {
  const r = computeOveragePct({
    rowKey: "a",
    colKey: "b",
    budgetMinor: 0,
    actualMinor: 100,
  });
  assert.equal(r, 100);
});

test("colorForOverage: critical bucket", () => {
  assert.equal(colorForOverage(60), "#dc2626");
});

test("colorForOverage: under bucket blue", () => {
  assert.equal(colorForOverage(-30), "#1d4ed8");
});

test("colorForOverage: on-budget neutral", () => {
  assert.equal(colorForOverage(5), "#f1f5f9");
});

test("computeHeatmapCells: each cell gets fill", () => {
  const r = computeHeatmapCells([
    { rowKey: "a", colKey: "b", budgetMinor: 100, actualMinor: 110 },
  ]);
  assert.ok(r[0].fill);
  assert.equal(r[0].overagePct, 10);
});

test("renderHeatmapSvg: empty → no data", () => {
  const svg = renderHeatmapSvg([]);
  assert.match(svg, /No data/);
});

test("renderHeatmapSvg: renders rows × cols", () => {
  const svg = renderHeatmapSvg([
    { rowKey: "Villa A", colKey: "Land", budgetMinor: 100, actualMinor: 80 },
    { rowKey: "Villa A", colKey: "Hard", budgetMinor: 200, actualMinor: 250 },
  ]);
  assert.match(svg, /Villa A/);
  assert.match(svg, /Land/);
});

// ===========================================================================
// 10) funnel-helpers
// ===========================================================================

test("computeFunnelStages: first stage 100% conversion", () => {
  const r = computeFunnelStages([
    { label: "L", count: 100 },
    { label: "Q", count: 25 },
  ]);
  assert.equal(r[0].conversionFromPrevPct, 100);
  assert.equal(r[1].conversionFromPrevPct, 25);
});

test("computeFunnelStages: width fractions correct", () => {
  const r = computeFunnelStages([
    { label: "L", count: 100 },
    { label: "Q", count: 50 },
  ]);
  assert.equal(r[0].widthFraction, 1);
  assert.equal(r[1].widthFraction, 0.5);
});

test("computeFunnelStages: empty → empty", () => {
  assert.deepEqual(computeFunnelStages([]), []);
});

test("renderFunnelSvg: includes label text", () => {
  const svg = renderFunnelSvg([
    { label: "Leads", count: 100 },
    { label: "Closed", count: 5 },
  ]);
  assert.match(svg, /Leads/);
  assert.match(svg, /Closed/);
});

// ===========================================================================
// 11) capital-timeline-helpers
// ===========================================================================

test("totalsByMonth: sums across rows", () => {
  const t = totalsByMonth([
    {
      monthLabel: "Jan",
      contributionsMinor: 100,
      drawdownsMinor: 50,
      distributionsMinor: 0,
    },
    {
      monthLabel: "Feb",
      contributionsMinor: 200,
      drawdownsMinor: 100,
      distributionsMinor: 25,
    },
  ]);
  assert.equal(t.totalContributions, 300);
  assert.equal(t.totalDrawdowns, 150);
  assert.equal(t.totalDistributions, 25);
});

test("renderCapitalTimelineSvg: empty → no data", () => {
  const svg = renderCapitalTimelineSvg([]);
  assert.match(svg, /No data/);
});

test("renderCapitalTimelineSvg: includes legend", () => {
  const svg = renderCapitalTimelineSvg([
    {
      monthLabel: "Jan",
      contributionsMinor: 100,
      drawdownsMinor: 50,
      distributionsMinor: 0,
    },
  ]);
  assert.match(svg, /Contributions/);
  assert.match(svg, /Drawdowns/);
  assert.match(svg, /Distributions/);
});

// ===========================================================================
// 12) productivity-helpers
// ===========================================================================

test("computeProductivitySeries: dedupes roles across months", () => {
  const r = computeProductivitySeries([
    {
      monthLabel: "Jan",
      utilized: { pm: 100, eng: 200 },
      totalCapacityHours: 400,
    },
    {
      monthLabel: "Feb",
      utilized: { pm: 110, eng: 210, qs: 50 },
      totalCapacityHours: 500,
    },
  ]);
  assert.equal(r.roles.length, 3);
  assert.equal(r.monthsTotalUtilized[0], 300);
  assert.equal(r.monthsIdle[0], 100);
});

test("renderProductivitySvg: empty → no data", () => {
  const svg = renderProductivitySvg([]);
  assert.match(svg, /No data/);
});

test("renderProductivitySvg: includes role legend", () => {
  const svg = renderProductivitySvg([
    {
      monthLabel: "Jan",
      utilized: { pm: 100 },
      totalCapacityHours: 200,
    },
  ]);
  assert.match(svg, /pm/);
});

// ===========================================================================
// 13) procurement-delays-helpers
// ===========================================================================

test("computeSupplierDelays: on-time = no late", () => {
  const r = computeSupplierDelays([
    {
      supplierId: "s",
      supplierName: "S",
      deliveries: [
        {
          expectedAt: new Date("2026-01-10"),
          actualAt: new Date("2026-01-09"),
        },
      ],
    },
  ]);
  assert.equal(r[0].lateDeliveries, 0);
  assert.equal(r[0].onTimePct, 100);
  assert.equal(r[0].avgDelayDays, -1);
});

test("computeSupplierDelays: late delivery", () => {
  const r = computeSupplierDelays([
    {
      supplierId: "s",
      supplierName: "S",
      deliveries: [
        {
          expectedAt: new Date("2026-01-10"),
          actualAt: new Date("2026-01-15"),
        },
      ],
    },
  ]);
  assert.equal(r[0].lateDeliveries, 1);
  assert.equal(r[0].onTimePct, 0);
});

test("computeSupplierDelays: not yet delivered → not counted in completed", () => {
  const r = computeSupplierDelays([
    {
      supplierId: "s",
      supplierName: "S",
      deliveries: [
        { expectedAt: new Date("2026-01-10"), actualAt: null },
      ],
    },
  ]);
  assert.equal(r[0].onTimePct, 0);
  assert.ok(Number.isNaN(r[0].avgDelayDays));
});

test("rankSuppliers: best on-time first", () => {
  const r = rankSuppliers([
    {
      supplierId: "a",
      supplierName: "A",
      totalDeliveries: 10,
      lateDeliveries: 5,
      onTimePct: 50,
      avgDelayDays: 2,
    },
    {
      supplierId: "b",
      supplierName: "B",
      totalDeliveries: 10,
      lateDeliveries: 0,
      onTimePct: 100,
      avgDelayDays: -1,
    },
  ]);
  assert.equal(r[0].supplierId, "b");
});

// ===========================================================================
// 14) risk-radar-detector — 7 rules
// ===========================================================================

test("ruleInvoiceWithoutPo: invoice missing PO is flagged", () => {
  const r = ruleInvoiceWithoutPo([
    {
      invoiceId: "i1",
      invoiceNumber: "INV-001",
      amountMinor: 50_000_00,
      hasPoLink: false,
      receivedAt: new Date("2026-04-01"),
    },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].category, "data_health");
});

test("ruleInvoiceWithoutPo: invoice with PO not flagged", () => {
  const r = ruleInvoiceWithoutPo([
    {
      invoiceId: "i1",
      invoiceNumber: "INV-001",
      amountMinor: 100,
      hasPoLink: true,
      receivedAt: new Date(),
    },
  ]);
  assert.equal(r.length, 0);
});

test("ruleInvoiceWithoutPo: high-amount → medium severity", () => {
  const r = ruleInvoiceWithoutPo([
    {
      invoiceId: "i1",
      invoiceNumber: "INV-001",
      amountMinor: 200_000_00,
      hasPoLink: false,
      receivedAt: new Date(),
    },
  ]);
  assert.equal(r[0].severity, "medium");
});

test("ruleTransactionMissingTax: bulk alert when over threshold", () => {
  const r = ruleTransactionMissingTax(
    Array.from({ length: 25 }, (_, i) => ({
      transactionId: `t${i}`,
      amountMinor: 100,
      ageDays: 10,
      hasTaxClassification: false,
    })),
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].severity, "medium");
});

test("ruleTransactionMissingTax: under threshold age → no alert", () => {
  const r = ruleTransactionMissingTax([
    {
      transactionId: "t1",
      amountMinor: 100,
      ageDays: 3,
      hasTaxClassification: false,
    },
  ]);
  assert.equal(r.length, 0);
});

test("rulePrWithoutDelivery: lead time exceeded → alert", () => {
  const r = rulePrWithoutDelivery([
    {
      prId: "p1",
      prCode: "PR-001",
      daysSinceApproved: 30,
      hasDelivery: false,
      expectedLeadTimeDays: 14,
    },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].category, "vendor_performance");
});

test("rulePrWithoutDelivery: 2x lead time → high severity", () => {
  const r = rulePrWithoutDelivery([
    {
      prId: "p1",
      prCode: "PR-001",
      daysSinceApproved: 35,
      hasDelivery: false,
      expectedLeadTimeDays: 14,
    },
  ]);
  assert.equal(r[0].severity, "high");
});

test("ruleHotLeadStale: stale follow-up → alert", () => {
  const r = ruleHotLeadStale([
    {
      leadId: "l1",
      leadName: "Acme",
      daysSinceLastFollowup: 21,
      followupThresholdDays: 7,
    },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].severity, "high");
});

test("ruleScheduleTaskOverdue: critical path overdue 14+ → critical", () => {
  const r = ruleScheduleTaskOverdue([
    {
      taskId: "t1",
      taskName: "Foundation",
      daysOverdue: 20,
      isOnCriticalPath: true,
      projectId: "p1",
    },
  ]);
  assert.equal(r[0].severity, "critical");
});

test("ruleScheduleTaskOverdue: non-critical short overdue → low", () => {
  const r = ruleScheduleTaskOverdue([
    {
      taskId: "t1",
      taskName: "Painting",
      daysOverdue: 3,
      isOnCriticalPath: false,
      projectId: "p1",
    },
  ]);
  assert.equal(r[0].severity, "low");
});

test("ruleCashGapForecast: < 14 days → critical", () => {
  const r = ruleCashGapForecast([
    {
      forecastId: "f1",
      daysUntilGap: 7,
      gapAmountMinor: 100_000_00,
    },
  ]);
  assert.equal(r[0].severity, "critical");
});

test("ruleCashGapForecast: > horizon → no alert", () => {
  const r = ruleCashGapForecast(
    [{ forecastId: "f1", daysUntilGap: 100, gapAmountMinor: 100_000_00 }],
    60,
  );
  assert.equal(r.length, 0);
});

test("ruleBudgetOverrun: 30+ overshoot → critical", () => {
  const r = ruleBudgetOverrun([
    {
      projectId: "p1",
      projectName: "Sawah",
      burnPct: 90,
      progressPct: 50,
    },
  ]);
  assert.equal(r[0].severity, "critical");
});

test("ruleBudgetOverrun: < 10 overshoot → no alert", () => {
  const r = ruleBudgetOverrun([
    {
      projectId: "p1",
      projectName: "Sawah",
      burnPct: 55,
      progressPct: 50,
    },
  ]);
  assert.equal(r.length, 0);
});

test("dedupeAgainstOpen: filters out matching keys", () => {
  const r = dedupeAgainstOpen(
    [
      {
        detectionMethod: "rule:x",
        category: "other",
        severity: "low",
        title: "T",
        description: "D",
        detectedPattern: "p",
        affectedEntities: {},
        supportingData: {},
        recommendedAction: "a",
        dedupeKey: "k1",
      },
      {
        detectionMethod: "rule:x",
        category: "other",
        severity: "low",
        title: "T",
        description: "D",
        detectedPattern: "p",
        affectedEntities: {},
        supportingData: {},
        recommendedAction: "a",
        dedupeKey: "k2",
      },
    ],
    new Set(["k1"]),
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].dedupeKey, "k2");
});

test("detectRecurringPatterns: 3+ occurrences flagged", () => {
  const r = detectRecurringPatterns(
    [
      { dedupeKey: "k1", resolvedAt: null },
      { dedupeKey: "k1", resolvedAt: null },
      { dedupeKey: "k1", resolvedAt: null },
      { dedupeKey: "k2", resolvedAt: null },
    ],
    3,
  );
  assert.deepEqual(r, ["k1"]);
});

// ===========================================================================
// 15) digest-helpers
// ===========================================================================

test("buildDigestSkeleton: includes all sections", () => {
  const r = buildDigestSkeleton({
    periodLabel: "April 2026",
    periodStart: new Date(Date.UTC(2026, 3, 1)),
    periodEnd: new Date(Date.UTC(2026, 3, 30)),
    baseCurrency: "IDR",
    snapshot: {
      totalCashOnHandMinor: 8_000_000_00,
      activeProjectsCount: 5,
      projectsOnTrack: 4,
      projectsAtRisk: 1,
      projectsDelayed: 0,
      activeLeadsCount: 30,
      contractsSignedThisMonth: 1,
      totalCommittedCapitalMinor: 20_000_000_00,
      totalDrawnCapitalMinor: 12_000_000_00,
      openQaQcIssues: 5,
      criticalQaQcIssues: 1,
      highRiskItemsCount: 2,
      payrollRunwayWeeks: 24,
    },
  });
  assert.match(r.executiveSummary, /executive summary/);
  assert.match(r.cashPosition, /Cash position/);
  assert.match(r.projectProgress, /Projects/);
  assert.match(r.sales, /Sales/);
  assert.match(r.investor, /Investor/);
  assert.match(r.operations, /Operations/);
  assert.match(r.risks, /Risks/);
});

test("buildDigestSkeleton: critical QA/QC → key concern", () => {
  const r = buildDigestSkeleton({
    periodLabel: "April 2026",
    periodStart: new Date(Date.UTC(2026, 3, 1)),
    periodEnd: new Date(Date.UTC(2026, 3, 30)),
    baseCurrency: "IDR",
    snapshot: {
      totalCashOnHandMinor: 8_000_000_00,
      activeProjectsCount: 5,
      projectsOnTrack: 4,
      projectsAtRisk: 1,
      projectsDelayed: 0,
      activeLeadsCount: 30,
      contractsSignedThisMonth: 1,
      totalCommittedCapitalMinor: 0,
      totalDrawnCapitalMinor: 0,
      openQaQcIssues: 5,
      criticalQaQcIssues: 2,
      highRiskItemsCount: 0,
      payrollRunwayWeeks: 60,
    },
  });
  assert.ok(r.keyConcerns.some((c) => /critical QA\/QC/.test(c)));
});

test("buildDigestSkeleton: delayed projects → key concern", () => {
  const r = buildDigestSkeleton({
    periodLabel: "April 2026",
    periodStart: new Date(Date.UTC(2026, 3, 1)),
    periodEnd: new Date(Date.UTC(2026, 3, 30)),
    baseCurrency: "IDR",
    snapshot: {
      totalCashOnHandMinor: 8_000_000_00,
      activeProjectsCount: 5,
      projectsOnTrack: 2,
      projectsAtRisk: 1,
      projectsDelayed: 2,
      activeLeadsCount: 30,
      contractsSignedThisMonth: 1,
      totalCommittedCapitalMinor: 0,
      totalDrawnCapitalMinor: 0,
      openQaQcIssues: 0,
      criticalQaQcIssues: 0,
      highRiskItemsCount: 0,
      payrollRunwayWeeks: 60,
    },
  });
  assert.ok(r.keyConcerns.some((c) => /delayed/.test(c)));
});

test("buildDigestSkeleton: payroll runway < 26w → recommendation", () => {
  const r = buildDigestSkeleton({
    periodLabel: "April 2026",
    periodStart: new Date(Date.UTC(2026, 3, 1)),
    periodEnd: new Date(Date.UTC(2026, 3, 30)),
    baseCurrency: "IDR",
    snapshot: {
      totalCashOnHandMinor: 1_000_000_00,
      activeProjectsCount: 1,
      projectsOnTrack: 1,
      projectsAtRisk: 0,
      projectsDelayed: 0,
      activeLeadsCount: 30,
      contractsSignedThisMonth: 0,
      totalCommittedCapitalMinor: 0,
      totalDrawnCapitalMinor: 0,
      openQaQcIssues: 0,
      criticalQaQcIssues: 0,
      highRiskItemsCount: 0,
      payrollRunwayWeeks: 12,
    },
  });
  assert.ok(r.recommendedActions.some((a) => /capital call/.test(a)));
});

test("nextDigestCode: includes year + month", () => {
  const code = nextDigestCode(new Date(Date.UTC(2026, 3, 15)));
  assert.equal(code, "DIGEST-2026-04");
});

// ===========================================================================
// 16) Cron + dispatcher + route audit
// ===========================================================================

test("cron index re-exports 3 new Stage 5.C runners", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  assert.match(idx, /runDevOsExecutiveMetricsDaily/);
  assert.match(idx, /runDevOsRiskRadarWeekly/);
  assert.match(idx, /runDevOsExecutiveDigestMonthly/);
});

test("cron index DEV_OS_JOB_KEYS includes 3 new keys", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  for (const k of [
    "dev_os_executive_metrics_daily",
    "dev_os_risk_radar_weekly",
    "dev_os_executive_digest_monthly",
  ]) {
    assert.ok(idx.includes(`"${k}"`), `key '${k}' missing`);
  }
});

test("dispatcher KNOWN_JOBS includes 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  for (const k of [
    "dev_os_executive_metrics_daily",
    "dev_os_risk_radar_weekly",
    "dev_os_executive_digest_monthly",
  ]) {
    assert.ok(src.includes(`"${k}"`), `KNOWN_JOBS missing '${k}'`);
  }
});

test("dispatcher executeJob switch covers 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  assert.match(src, /case "dev_os_executive_metrics_daily":/);
  assert.match(src, /case "dev_os_risk_radar_weekly":/);
  assert.match(src, /case "dev_os_executive_digest_monthly":/);
});

test("3 new HTTP cron route files exist", () => {
  for (const slug of [
    "dev-os-executive-metrics-daily",
    "dev-os-risk-radar-weekly",
    "dev-os-executive-digest-monthly",
  ]) {
    assert.ok(
      exists(`src/app/api/cron/${slug}/route.ts`),
      `route file missing for ${slug}`,
    );
  }
});

test("each new route uses handleCronJobRequest", () => {
  for (const slug of [
    "dev-os-executive-metrics-daily",
    "dev-os-risk-radar-weekly",
    "dev-os-executive-digest-monthly",
  ]) {
    const src = read(`src/app/api/cron/${slug}/route.ts`);
    assert.match(src, /handleCronJobRequest/);
  }
});

test("VERCEL-CRON-CHECKLIST documents 3 new routes", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-executive-metrics-daily/);
  assert.match(md, /\/api\/cron\/dev-os-risk-radar-weekly/);
  assert.match(md, /\/api\/cron\/dev-os-executive-digest-monthly/);
});

test("vercel.json snippet contains 3 new entries", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  for (const slug of [
    "dev-os-executive-metrics-daily",
    "dev-os-risk-radar-weekly",
    "dev-os-executive-digest-monthly",
  ]) {
    assert.ok(md.includes(`{ "path": "/api/cron/${slug}"`), `${slug} missing from vercel.json snippet`);
  }
});

// ===========================================================================
// 17) Sidebar audit — EXECUTIVE group
// ===========================================================================

test("sidebar nav has Executive group", () => {
  const src = read("src/lib/development/navigation.ts");
  assert.match(src, /label: "Executive"/);
});

test("sidebar nav has 4 EXECUTIVE entries", () => {
  const src = read("src/lib/development/navigation.ts");
  for (const href of [
    "/dashboard",
    "/reports",
    "/risk-radar",
    "/digests",
  ]) {
    assert.ok(src.includes(href), `nav missing ${href}`);
  }
});

// ===========================================================================
// 18) UI page presence
// ===========================================================================

test("executive dashboard page exists", () => {
  assert.ok(
    exists("src/app/(development-app)/development-os/dashboard/page.tsx"),
  );
});

test("8 visual report pages exist", () => {
  for (const slug of [
    "cashflow-waterfall",
    "s-curve",
    "budget-burn",
    "cost-heatmap",
    "investor-capital-timeline",
    "sales-funnel",
    "workforce-productivity",
    "procurement-delays",
  ]) {
    assert.ok(
      exists(`src/app/(development-app)/development-os/reports/${slug}/page.tsx`),
      `${slug} page missing`,
    );
  }
});

test("risk radar pages exist (inbox + detail)", () => {
  assert.ok(
    exists("src/app/(development-app)/development-os/risk-radar/page.tsx"),
  );
  assert.ok(
    exists("src/app/(development-app)/development-os/risk-radar/[code]/page.tsx"),
  );
});

test("digest pages exist (list + detail + new)", () => {
  assert.ok(
    exists("src/app/(development-app)/development-os/digests/page.tsx"),
  );
  assert.ok(
    exists("src/app/(development-app)/development-os/digests/[code]/page.tsx"),
  );
  assert.ok(
    exists("src/app/(development-app)/development-os/digests/new/page.tsx"),
  );
});

// ===========================================================================
// 19) Server module presence (file-grep — server-only modules)
// ===========================================================================

test("metrics-aggregator file exposes composeExecutiveSnapshot", () => {
  const src = read(
    "src/lib/development/server/executive/metrics-aggregator.ts",
  );
  assert.match(src, /export function composeExecutiveSnapshot/);
});

test("metrics-actions exposes persistExecutiveSnapshot", () => {
  const src = read("src/lib/development/server/executive/metrics-actions.ts");
  assert.match(src, /export async function persistExecutiveSnapshot/);
  assert.match(src, /import "server-only"/);
});

test("risk-radar-actions exposes 4 workflow functions", () => {
  const src = read(
    "src/lib/development/server/risk-radar/risk-radar-actions.ts",
  );
  assert.match(src, /export async function persistDetectedAlert/);
  assert.match(src, /export async function acknowledgeAlert/);
  assert.match(src, /export async function resolveAlert/);
  assert.match(src, /export async function markFalsePositive/);
});

test("risk-radar-ai-agent dry-run mode by default", () => {
  const src = read(
    "src/lib/development/server/risk-radar/risk-radar-ai-agent.ts",
  );
  assert.match(src, /AI_DRY_RUN|ANTHROPIC_API_KEY/);
});

test("digest-actions exposes 4 workflow functions", () => {
  const src = read(
    "src/lib/development/server/executive-digest/digest-actions.ts",
  );
  assert.match(src, /export async function generateDigest/);
  assert.match(src, /export async function approveDigest/);
  assert.match(src, /export async function distributeDigest/);
  assert.match(src, /export async function editDigestSection/);
});

test("3 new cron job files exist + export runners", () => {
  for (const [slug, fn] of [
    ["executive-metrics-daily-job", "runDevOsExecutiveMetricsDaily"],
    ["risk-radar-weekly-job", "runDevOsRiskRadarWeekly"],
    ["executive-digest-monthly-job", "runDevOsExecutiveDigestMonthly"],
  ]) {
    const src = read(`src/lib/development/server/cron/${slug}.ts`);
    assert.match(src, new RegExp(`export async function ${fn}`));
  }
});

// ===========================================================================
// 20) Demo seed audit
// ===========================================================================

test("seed script declares Stage 5.C section header", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.C seeding/);
});

test("seed script seeds metrics snapshots + risk alerts + digests", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /INSERT INTO executive_metrics_snapshots/);
  assert.match(seed, /INSERT INTO risk_radar_alerts/);
  assert.match(seed, /INSERT INTO executive_digests/);
});

test("seed script uses ON CONFLICT or exists-check pattern for idempotency", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.C seeding[\s\S]*?if \(exists\[0\]\)/);
});

// ===========================================================================
// 21) Architecture documentation
// ===========================================================================

test("architecture doc references Stage 5.C", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.C/);
});

test("architecture doc Stage 5.B accepted", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.B[\s\S]*?\[ACCEPTED 5\.B\]/);
});

test("architecture doc Stage 5.C marker present (ACTIVE or ACCEPTED)", () => {
  const md = read("docs/development-os-architecture.md");
  // Marker progresses ACTIVE → ACCEPTED as later stages activate.
  assert.match(md, /Stage 5\.C[\s\S]*?\[(?:ACTIVE|ACCEPTED) 5\.C\]/);
});

test("architecture doc explains zero-deps SVG charts", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /SVG/);
});
