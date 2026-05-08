import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getLatestCompanySnapshot } from "@/lib/development/server/executive/metrics-queries";
import { listRecentAlerts } from "@/lib/development/server/risk-radar/risk-radar-queries";
import { listDigests } from "@/lib/development/server/executive-digest/digest-queries";
import { safeQuery } from "@/lib/development/safe-query";
import {
  buildCashOnHandWidget,
  buildPayrollRunwayWidget,
  buildProjectsHealthWidget,
  buildBudgetBurnWidget,
  buildSalesPipelineWidget,
  buildInvestorCapitalWidget,
  buildQaQcWidget,
  formatMinorAsCurrency,
} from "@/lib/development/server/executive/widgets-helpers";

export const metadata: Metadata = {
  title: "Executive dashboard · Development OS",
};
export const dynamic = "force-dynamic";

export default async function ExecutiveDashboardPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Executive dashboard" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const snapshot = await safeQuery(
    "getLatestCompanySnapshot",
    getLatestCompanySnapshot(),
    null,
  );
  const alerts = await safeQuery(
    "listRecentAlerts",
    listRecentAlerts({
      limit: 5,
      status: ["open", "acknowledged", "investigating"],
    }),
    [],
  );
  const digests = await safeQuery("listDigests", listDigests(1), []);

  if (!snapshot) {
    return (
      <DevelopmentShell>
        <PageHeader title="Executive dashboard" />
        <EmptyState
          title="No snapshots yet"
          description="The daily metrics cron will populate this dashboard. Run it manually from the Jobs page or wait for the next 04:00 run."
        
          action={
            <Link href="/dashboard/jobs" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">View jobs</Link>
          }
        />
      </DevelopmentShell>
    );
  }

  const baseCurrency = snapshot.baseCurrency;

  // Build widget views.
  const cash = buildCashOnHandWidget(
    {
      totalCashOnHandMinor: Number(snapshot.totalCashOnHandMinor),
      baseCurrency,
    },
    null,
  );
  const runway = buildPayrollRunwayWidget({
    weeks: Number(snapshot.payrollRunwayWeeks ?? 0),
  });
  const projHealth = buildProjectsHealthWidget({
    onTrack: snapshot.projectsOnTrack,
    atRisk: snapshot.projectsAtRisk,
    delayed: snapshot.projectsDelayed,
  });
  const budgetBurn = buildBudgetBurnWidget({
    committedMinor: snapshot.totalCommittedBudgetMinor
      ? Number(snapshot.totalCommittedBudgetMinor)
      : 0,
    actualMinor: snapshot.totalActualSpendMinor
      ? Number(snapshot.totalActualSpendMinor)
      : 0,
    baseCurrency,
  });
  const pipeline = buildSalesPipelineWidget({
    totalPipelineValueMinor: Number(snapshot.totalPipelineValueMinor),
    hotLeadsCount: snapshot.hotLeadsCount,
    baseCurrency,
  });
  const capital = buildInvestorCapitalWidget({
    committedMinor: Number(snapshot.totalCommittedCapitalMinor),
    drawnMinor: Number(snapshot.totalDrawnCapitalMinor),
    baseCurrency,
  });
  const qaqc = buildQaQcWidget({
    open: snapshot.openQaQcIssues,
    critical: snapshot.criticalQaQcIssues,
  });

  const cashGap30 = snapshot.cashAt30DaysMinor
    ? formatMinorAsCurrency(Number(snapshot.cashAt30DaysMinor), baseCurrency)
    : "—";
  const cashGap60 = snapshot.cashAt60DaysMinor
    ? formatMinorAsCurrency(Number(snapshot.cashAt60DaysMinor), baseCurrency)
    : "—";
  const cashGap90 = snapshot.cashAt90DaysMinor
    ? formatMinorAsCurrency(Number(snapshot.cashAt90DaysMinor), baseCurrency)
    : "—";

  const receivables = snapshot.receivablesAging as
    | {
        current: number;
        days_1_30: number;
        days_31_60: number;
        days_61_90: number;
        days_over_90: number;
      }
    | null;

  return (
    <DevelopmentShell>
      <PageHeader
        title="Executive dashboard"
        description={`Snapshot from ${snapshot.snapshotDate} · base currency ${baseCurrency}`}
      />

      <Section title="Cash & liquidity">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label={cash.label} value={cash.value} accent />
          <MetricCard label="30-day cash" value={cashGap30} hint="forecast" />
          <MetricCard label="60-day cash" value={cashGap60} hint="forecast" />
          <MetricCard label="90-day cash" value={cashGap90} hint="forecast" />
        </div>
        {receivables && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Receivables current"
              value={formatMinorAsCurrency(receivables.current, baseCurrency)}
            />
            <MetricCard
              label="Receivables 1–30d"
              value={formatMinorAsCurrency(receivables.days_1_30, baseCurrency)}
            />
            <MetricCard
              label="Receivables 31–60d"
              value={formatMinorAsCurrency(
                receivables.days_31_60,
                baseCurrency,
              )}
            />
            <MetricCard
              label="Receivables >90d"
              value={formatMinorAsCurrency(
                receivables.days_over_90,
                baseCurrency,
              )}
            />
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Payables next 30d"
            value={
              snapshot.payablesDueNext30DaysMinor
                ? formatMinorAsCurrency(
                    Number(snapshot.payablesDueNext30DaysMinor),
                    baseCurrency,
                  )
                : "—"
            }
          />
          <MetricCard
            label="Payables overdue"
            value={
              snapshot.payablesOverdueMinor
                ? formatMinorAsCurrency(
                    Number(snapshot.payablesOverdueMinor),
                    baseCurrency,
                  )
                : "—"
            }
          />
          <MetricCard
            label={runway.label}
            value={runway.value}
            hint={runway.riskLevel}
          />
          <MetricCard
            label="Cash gaps identified"
            value={`${snapshot.identifiedCashGapsCount}`}
          />
        </div>
      </Section>

      <Section title="Project health">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Projects active"
            value={`${snapshot.activeProjectsCount}`}
          />
          <MetricCard
            label="On track"
            value={`${projHealth.breakdown.onTrack}`}
          />
          <MetricCard
            label="At risk"
            value={`${projHealth.breakdown.atRisk}`}
          />
          <MetricCard
            label="Delayed"
            value={`${projHealth.breakdown.delayed}`}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard label={budgetBurn.label} value={budgetBurn.value} />
          <MetricCard
            label="Schedule health"
            value={`${projHealth.healthPct.toFixed(0)}% on time`}
          />
          <MetricCard
            label="High-risk items"
            value={`${snapshot.highRiskItemsCount}`}
          />
        </div>
      </Section>

      <Section title="Sales & capital">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label={pipeline.label} value={pipeline.value} />
          <MetricCard label="Hot leads" value={`${pipeline.hotLeadsCount}`} />
          <MetricCard label={capital.label} value={capital.value} />
          <MetricCard
            label="Pending investor requests"
            value={`${snapshot.pendingInvestorRequestsCount}`}
          />
        </div>
      </Section>

      <Section title="Operations & quality">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label={qaqc.label} value={qaqc.value} />
          <MetricCard
            label="QA/QC critical"
            value={`${snapshot.criticalQaQcIssues}`}
          />
          <MetricCard
            label="Pending change orders"
            value={`${snapshot.pendingChangeOrders}`}
          />
          <MetricCard
            label="Low stock items"
            value={`${snapshot.lowStockItemsCount}`}
          />
        </div>
      </Section>

      <Section title="AI insights">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-md bg-surface border border-line-soft p-6 flex flex-col gap-3">
            <span className="text-label">Latest risk alerts</span>
            {alerts.length === 0 ? (
              <span className="text-sm text-ink-tertiary">No open alerts.</span>
            ) : (
              <ul className="text-sm flex flex-col gap-2">
                {alerts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-2 border-b border-line-soft pb-1"
                  >
                    <span className="truncate">{a.title}</span>
                    <Badge
                      tone={
                        a.severity === "critical"
                          ? "danger"
                          : a.severity === "high"
                            ? "warning"
                            : "info"
                      }
                    >
                      {a.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-md bg-surface border border-line-soft p-6 flex flex-col gap-3">
            <span className="text-label">Latest executive digest</span>
            {digests.length === 0 ? (
              <span className="text-sm text-ink-tertiary">
                No digest yet — the monthly digest cron will create one on the 1st.
              </span>
            ) : (
              <div>
                <div className="text-base font-medium">{digests[0].periodLabel}</div>
                <div className="text-xs text-ink-tertiary mt-1">
                  Status: {digests[0].status}
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>
    </DevelopmentShell>
  );
}
