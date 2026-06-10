import type { Metadata } from "next";
import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";
import {
  getLatestCompanySnapshot,
  listCompanySnapshotsInRange,
} from "@/lib/development/server/executive/metrics-queries";
import {
  listAlertsInRange,
  listRecentAlerts,
} from "@/lib/development/server/risk-radar/risk-radar-queries";
import { listDigests } from "@/lib/development/server/executive-digest/digest-queries";
import { formatMinorAsCurrency } from "@/lib/development/server/executive/widgets-helpers";
import { getActiveProjectsRollup } from "@/lib/development/server/cabinets/dev-overview-queries";
import { getProjectFinancialSummary } from "@/lib/development/server/budget";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import {
  computeTimeRangeRollup,
  monthBounds,
  type RangeSnapshot,
} from "@/lib/development/server/executive/time-range-rollup";
import { HistoryAccrualNote } from "./_rollup-shared";

/**
 * Dev OS Executive cabinet — hero (monthly default).
 *
 * Mock: cc-functional-handoff/cabinets/new/dev-executive.html §01.
 * Composes existing reads only: executive_metrics_snapshots (daily cron),
 * risk_radar_alerts, executive_digests, and the org-scoped projects
 * rollup + budget summary already used by the Dev OS overview / finance
 * cabinets. Period switcher: monthly (here) · quarterly · YTD.
 */

export const metadata: Metadata = { title: "Executive · Development OS" };
export const dynamic = "force-dynamic";

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function severityTone(sev: string): "danger" | "warn" | "soft" {
  if (sev === "critical" || sev === "high") return "danger";
  if (sev === "medium") return "warn";
  return "soft";
}

function severityLetter(sev: string): string {
  return (sev[0] ?? "?").toUpperCase();
}

/** Snapshot rows from drizzle → the pure rollup's number shape. */
function toRangeSnapshot(r: {
  snapshotDate: string;
  baseCurrency: string;
  totalCashOnHandMinor: bigint;
  totalPipelineValueMinor: bigint;
  totalCommittedCapitalMinor: bigint;
  totalDrawnCapitalMinor: bigint;
  pendingDistributionMinor: bigint;
  contractsSignedThisMonth: number;
  activeProjectsCount: number;
  projectsOnTrack: number;
  projectsAtRisk: number;
  projectsDelayed: number;
  highRiskItemsCount: number;
}): RangeSnapshot {
  return {
    snapshotDate: r.snapshotDate,
    baseCurrency: r.baseCurrency,
    totalCashOnHandMinor: Number(r.totalCashOnHandMinor),
    totalPipelineValueMinor: Number(r.totalPipelineValueMinor),
    totalCommittedCapitalMinor: Number(r.totalCommittedCapitalMinor),
    totalDrawnCapitalMinor: Number(r.totalDrawnCapitalMinor),
    pendingDistributionMinor: Number(r.pendingDistributionMinor),
    contractsSignedThisMonth: r.contractsSignedThisMonth,
    activeProjectsCount: r.activeProjectsCount,
    projectsOnTrack: r.projectsOnTrack,
    projectsAtRisk: r.projectsAtRisk,
    projectsDelayed: r.projectsDelayed,
    highRiskItemsCount: r.highRiskItemsCount,
  };
}

function PageHead({
  sub,
  monthLabel,
}: {
  sub: string;
  monthLabel: string;
}) {
  return (
    <div className="page-header">
      <div className="left">
        <div className="crumb">
          <Link href="/development-os">Development OS</Link> / Executive
        </div>
        <h1>
          Executive{" "}
          <span className="text-[var(--amber)]">
            · {monthLabel.toLowerCase()}
          </span>
        </h1>
        <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
          {sub}
        </p>
      </div>
      <div className="actions">
        <span className="btn btn-amber btn-sm cursor-default">Monthly</span>
        <Link
          href="/development-os/executive/quarterly"
          className="btn btn-secondary btn-sm"
        >
          Quarterly
        </Link>
        <Link
          href="/development-os/executive/ytd"
          className="btn btn-secondary btn-sm"
        >
          YTD
        </Link>
      </div>
    </div>
  );
}

export default async function ExecutiveMonthlyPage() {
  const db = getDb();
  const now = new Date();
  const { start, end, label } = monthBounds(now);

  if (!db) {
    return (
      <DevelopmentShell>
        <PageHead monthLabel={label} sub="Portfolio at a glance." />
        <EmptyState
          title="Executive cabinet runs against the database"
          description="Database connection not configured. Contact support."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      </DevelopmentShell>
    );
  }

  const [latest, snapshotRows, monthAlerts, openAlerts, digests, projects] =
    await Promise.all([
      safeQuery("getLatestCompanySnapshot", getLatestCompanySnapshot(), null),
      safeQuery(
        "listCompanySnapshotsInRange:month",
        listCompanySnapshotsInRange(start, end),
        [],
      ),
      safeQuery("listAlertsInRange:month", listAlertsInRange(start, end), []),
      safeQuery(
        "listRecentAlerts:openLike",
        listRecentAlerts({
          limit: 50,
          status: ["open", "acknowledged", "investigating"],
        }),
        [],
      ),
      safeQuery("listDigests:latest3", listDigests(3), []),
      safeQuery("getActiveProjectsRollup", getActiveProjectsRollup(), []),
    ]);

  // Per-project budget rollup — same read finance/page.tsx uses.
  const projectSummaries = await Promise.all(
    projects.map(async (p) => {
      const summary = await safeQuery(
        `getProjectFinancialSummary:${p.projectCode}`,
        getProjectFinancialSummary(p.projectId),
        {
          totalBudgetUsdMinor: "0",
          totalCommittedUsdMinor: "0",
          totalActualUsdMinor: "0",
          remainingBudgetUsdMinor: "0",
          budgetConsumedPercent: 0,
          outstandingCommitmentUsdMinor: "0",
          byCategoryType: {
            capex: { budget: "0", actual: "0" },
            cogs: { budget: "0", actual: "0" },
            opex: { budget: "0", actual: "0" },
          },
        },
        4000,
      );
      return { ...p, summary };
    }),
  );

  const rollup = computeTimeRangeRollup(
    snapshotRows.map(toRangeSnapshot),
    monthAlerts.map((a) => ({ severity: a.severity, detectedAt: a.detectedAt })),
  );

  const cur = latest?.baseCurrency ?? rollup.baseCurrency;
  const fmt = (v: number | bigint | null | undefined) =>
    v == null ? "—" : formatMinorAsCurrency(Number(v), cur);

  // Severity-ranked open risks — top 5 for the radar card.
  const topRisks = [...openAlerts]
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
        +new Date(b.detectedAt) - +new Date(a.detectedAt),
    )
    .slice(0, 5);
  const highOpenCount = openAlerts.filter(
    (a) => a.severity === "high" || a.severity === "critical",
  ).length;

  const drawnPct =
    latest && latest.totalCommittedCapitalMinor > 0n
      ? Number(
          (latest.totalDrawnCapitalMinor * 10000n) /
            latest.totalCommittedCapitalMinor,
        ) / 100
      : 0;

  const sub = [
    `${projects.length} project${projects.length === 1 ? "" : "s"}`,
    `${openAlerts.length} open risk${openAlerts.length === 1 ? "" : "s"}${highOpenCount > 0 ? ` (${highOpenCount} high)` : ""}`,
    latest
      ? `metrics as of ${latest.snapshotDate}`
      : "no metrics snapshot yet",
  ].join(" · ");

  const cashDeltaTone =
    rollup.cashDeltaMinor == null
      ? undefined
      : rollup.cashDeltaMinor >= 0
        ? ("success" as const)
        : ("danger" as const);

  return (
    <DevelopmentShell>
      <PageHead monthLabel={label} sub={sub} />

      <HistoryAccrualNote
        snapshotCount={rollup.snapshotCount}
        rangeLabel={label}
      />

      {/* Portfolio rollup KPI strip — mock §01 `.kpi-row`. */}
      <div className="cfo-kpis">
        <Kpi
          label="Cash on hand"
          value={fmt(latest?.totalCashOnHandMinor)}
          sub={latest ? `as of ${latest.snapshotDate}` : "awaiting first snapshot"}
        />
        <Kpi
          label={`Cashflow · ${label.toLowerCase()}`}
          value={fmt(rollup.cashDeltaMinor)}
          sub={
            rollup.snapshotCount >= 2
              ? `across ${rollup.snapshotCount} daily snapshots`
              : "history accruing"
          }
          tone={cashDeltaTone}
        />
        <Kpi
          label="GMV pipeline"
          value={fmt(latest?.totalPipelineValueMinor)}
          sub={
            latest
              ? `${latest.activeLeadsCount} leads · ${latest.reservationsCount} reservations`
              : "—"
          }
          tone="accent"
        />
        <Kpi
          label="Capital committed"
          value={fmt(latest?.totalCommittedCapitalMinor)}
          sub={latest ? `${drawnPct.toFixed(0)}% drawn` : "—"}
        />
        <Kpi
          label={`Risks raised · ${label.toLowerCase()}`}
          value={String(rollup.risk.total)}
          sub={`${rollup.risk.high} H · ${rollup.risk.medium} M · ${rollup.risk.low} L`}
          tone={rollup.risk.high > 0 ? "warn" : undefined}
        />
      </div>

      <div className="cfo-grid">
        {/* Left — portfolio rollup per project. */}
        <Card padding="default">
          <div className="cfo-card-head">
            <h3 className="cfo-card-title">
              Portfolio · {projects.length}{" "}
              {projects.length === 1 ? "project" : "projects"}
            </h3>
            <span className="label">budget vs actual · USD</span>
          </div>
          {projectSummaries.length === 0 ? (
            <EmptyState
              title="No active projects"
              description="The portfolio rollup populates as development projects are created."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Stage</th>
                  <th className="num">Spent / budget</th>
                  <th className="num">Burn</th>
                </tr>
              </thead>
              <tbody>
                {projectSummaries.map((p) => (
                  <tr key={p.projectId}>
                    <td className="display font-medium text-ink">
                      <Link
                        href={`/development-os/workspace/project/${p.projectId}`}
                        className="hover:underline"
                      >
                        {p.name}
                      </Link>
                      <div className="mono text-[10px] text-[var(--ink-3)]">
                        {p.projectCode} · {p.villaCount}{" "}
                        {p.villaCount === 1 ? "villa" : "villas"}
                      </div>
                    </td>
                    <td>
                      <HandoffBadge>{p.status.replace(/_/g, " ")}</HandoffBadge>
                    </td>
                    <td className="num">
                      {formatUsdMinor(BigInt(p.summary.totalActualUsdMinor))} /{" "}
                      {formatUsdMinor(BigInt(p.summary.totalBudgetUsdMinor))}
                    </td>
                    <td className="num">
                      <HandoffBadge
                        tone={
                          p.summary.budgetConsumedPercent > 90
                            ? "danger"
                            : p.summary.budgetConsumedPercent > 75
                              ? "warn"
                              : "ok"
                        }
                      >
                        {p.summary.budgetConsumedPercent.toFixed(1)}%
                      </HandoffBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {latest && (
            <p className="cfo-card-sub mt-[14px] mb-0">
              Health rollup (latest snapshot): {latest.projectsOnTrack} on
              track · {latest.projectsAtRisk} at risk ·{" "}
              {latest.projectsDelayed} delayed.
            </p>
          )}
        </Card>

        {/* Right — risk radar + latest digests. */}
        <div className="flex flex-col gap-[18px]">
          <Card padding="default">
            <div className="cfo-card-head">
              <h3 className="cfo-card-title">
                Risk radar · {openAlerts.length} open
              </h3>
              <span className="label">severity-ranked</span>
            </div>
            {topRisks.length === 0 ? (
              <p className="cfo-card-sub mt-[14px] mb-0">
                No open risk alerts. The risk-detector job raises alerts here
                as it scans portfolio signals.
              </p>
            ) : (
              <div className="flex flex-col">
                {topRisks.map((r) => (
                  <Link
                    key={r.id}
                    href={`/development-os/executive/risk/${r.alertCode}`}
                    className="flex items-center gap-3 py-2.5 border-b border-[var(--line-soft)] last:border-b-0 no-underline group"
                  >
                    <HandoffBadge tone={severityTone(r.severity)}>
                      {severityLetter(r.severity)}
                    </HandoffBadge>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium text-ink truncate group-hover:underline">
                        {r.title}
                      </span>
                      <span className="block mono text-[10px] text-[var(--ink-3)] mt-0.5">
                        {r.alertCategory.replace(/_/g, " ")} ·{" "}
                        {new Date(r.detectedAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="mono text-[10.5px] text-[var(--ink-3)] uppercase">
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-3.5">
              <Link
                href="/development-os/risk-radar"
                className="btn btn-secondary btn-sm"
              >
                Full risk radar →
              </Link>
            </div>
          </Card>

          <Card padding="default">
            <div className="cfo-card-head">
              <h3 className="cfo-card-title">Digests · latest {digests.length}</h3>
              <span className="label">executive summaries</span>
            </div>
            {digests.length === 0 ? (
              <p className="cfo-card-sub mt-[14px] mb-0">
                No digests yet — the monthly digest job drafts one per period.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5 mt-1">
                {digests.map((d) => (
                  <Link
                    key={d.id}
                    href={`/development-os/digests/${d.digestCode}`}
                    className="block rounded-[10px] border border-[var(--line)] bg-[var(--panel,var(--bg-3))] px-3.5 py-[11px] text-[12px] leading-relaxed text-[var(--ink-3)] no-underline hover:border-[var(--amber)]"
                  >
                    <span className="block mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--ink-4,var(--ink-3))] mb-1">
                      {d.periodLabel} · {d.status.replace(/_/g, " ")}
                      {d.aiGenerated ? " · AI-drafted" : ""}
                    </span>
                    <span className="font-medium text-ink">
                      {d.executiveSummary.length > 180
                        ? `${d.executiveSummary.slice(0, 180)}…`
                        : d.executiveSummary}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-3.5">
              <Link
                href="/development-os/executive/digests"
                className="btn btn-secondary btn-sm"
              >
                Digest archive →
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </DevelopmentShell>
  );
}
