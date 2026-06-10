import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { EmptyState } from "@/components/ui/empty-state";
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

type KpiTone = "ink" | "amber" | "ok" | "warn" | "danger";

const KPI_VALUE_TONE: Record<KpiTone, string> = {
  ink: "text-ink",
  amber: "text-accent",
  ok: "text-success",
  warn: "text-warning",
  danger: "text-danger",
};

function KpiBig({
  label,
  value,
  ctx,
  tone = "ink",
}: {
  label: string;
  value: string;
  ctx?: string;
  tone?: KpiTone;
}) {
  return (
    <div className="rounded-md bg-surface border border-line-soft px-[18px] py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-tertiary">
        {label}
      </div>
      <div
        className={`mt-1.5 font-display text-[36px] leading-none ${KPI_VALUE_TONE[tone]}`}
      >
        {value}
      </div>
      {ctx ? (
        <div className="mt-[5px] font-mono text-[10.5px] text-ink-tertiary">
          {ctx}
        </div>
      ) : null}
    </div>
  );
}

const HEALTH_BUCKET = {
  ok: {
    pill: "bg-success-weak text-success",
    bar: "bg-success",
    label: "on track",
  },
  warn: {
    pill: "bg-warning-weak text-warning",
    bar: "bg-warning",
    label: "attention",
  },
  danger: {
    pill: "bg-danger-weak text-danger",
    bar: "bg-danger",
    label: "delayed",
  },
} as const;

function HealthRow({
  name,
  stage,
  meta,
  pct,
  tone,
}: {
  name: string;
  stage: string;
  meta: string;
  pct: number;
  tone: keyof typeof HEALTH_BUCKET;
}) {
  const bucket = HEALTH_BUCKET[tone];
  const width = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="rounded-md bg-surface border border-line-soft px-4 py-[13px]">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-base text-ink">{name}</span>
        <span className="rounded-[3px] bg-accent-weak px-[7px] py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-accent-deep">
          {stage}
        </span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[10.5px] ${bucket.pill}`}
        >
          {bucket.label}
        </span>
      </div>
      <div className="mt-1.5 font-mono text-[11px] text-ink-tertiary">{meta}</div>
      <div className="mt-2 h-[5px] overflow-hidden rounded-[3px] bg-inset">
        <div
          className={`h-full ${bucket.bar}`}
          style={{ width: `${width}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

const SEV_BADGE = {
  high: { box: "bg-danger text-ink-inverse", glyph: "H" },
  med: { box: "bg-warning text-ink-inverse", glyph: "M" },
  low: { box: "bg-inset text-ink-secondary", glyph: "L" },
} as const;

type AlertSeverity = "critical" | "high" | "medium" | "low" | string;

function sevTone(severity: AlertSeverity): keyof typeof SEV_BADGE {
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "medium") return "med";
  return "low";
}

export default async function ExecutiveDashboardPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <ExecutiveHeader title="Executive dashboard" />
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
  const digests = await safeQuery("listDigests", listDigests(3), []);

  if (!snapshot) {
    return (
      <DevelopmentShell>
        <ExecutiveHeader title="Executive dashboard" />
        <EmptyState
          title="No snapshots yet"
          description="The daily metrics cron will populate this dashboard. Run it manually from the Jobs page or wait for the next 04:00 run."
          action={
            <Link
              href="/dashboard/jobs"
              className="inline-flex items-center justify-center rounded-md border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/60"
            >
              View jobs
            </Link>
          }
        />
      </DevelopmentShell>
    );
  }

  const baseCurrency = snapshot.baseCurrency;

  // Build widget views (data wiring preserved).
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

  // Schedule-weighted health → KPI tone band.
  const schedulePct = projHealth.healthPct;
  const scheduleTone: KpiTone =
    schedulePct >= 80 ? "ok" : schedulePct >= 60 ? "warn" : "danger";

  // Cashflow tone: amber accent unless 30-day forecast is negative.
  const cash30Negative =
    snapshot.cashAt30DaysMinor != null &&
    Number(snapshot.cashAt30DaysMinor) < 0;

  const total = snapshot.activeProjectsCount;
  const cashflowPositive90 =
    snapshot.cashAt90DaysMinor != null &&
    Number(snapshot.cashAt90DaysMinor) >= 0;
  const highSevRisks = alerts.filter(
    (a) => a.severity === "critical" || a.severity === "high",
  ).length;

  const headerSub = [
    `${total} ${total === 1 ? "project" : "projects"}`,
    cashflowPositive90 ? "cashflow positive 90d" : "cash watch 90d",
    `${highSevRisks} high-severity ${highSevRisks === 1 ? "risk" : "risks"}`,
  ].join(" · ");

  const periodLabel = snapshot.snapshotDate;

  return (
    <DevelopmentShell>
      <ExecutiveHeader
        title="Executive"
        emphasis={`· ${periodLabel}`}
        sub={headerSub}
        actions={
          <>
            <span className="inline-flex items-center rounded-md border border-line-soft bg-surface text-[13.5px] font-medium text-ink-secondary">
              <span className="px-[14px] py-[9px] text-ink">
                {periodLabel}
              </span>
              <Link
                href="/development-os/executive/quarterly"
                className="border-l border-line-soft px-[12px] py-[9px] hover:bg-muted/60"
              >
                Quarterly
              </Link>
              <Link
                href="/development-os/executive/ytd"
                className="border-l border-line-soft px-[12px] py-[9px] hover:bg-muted/60"
              >
                YTD
              </Link>
            </span>
            <Link
              href="/development-os/digests"
              className="inline-flex items-center rounded-md border border-ink bg-ink px-[14px] py-[9px] text-[13.5px] font-medium text-ink-inverse hover:opacity-90"
            >
              Daily digest
            </Link>
          </>
        }
      />

      {/* KPI strip — portfolio-wide rollup. */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiBig
          label="cashflow 30d"
          value={cashGap30}
          ctx={
            cash30Negative
              ? "forecast · watch coverage"
              : `${cash.value} on hand`
          }
          tone={cash30Negative ? "danger" : "amber"}
        />
        <KpiBig
          label="GMV pipeline"
          value={pipeline.value}
          ctx={`${pipeline.hotLeadsCount} hot leads`}
        />
        <KpiBig
          label="capital committed"
          value={capital.value}
          ctx={`${capital.drawnPct.toFixed(0)}% drawn`}
          tone="ok"
        />
        <KpiBig
          label="sched weighted"
          value={`${schedulePct.toFixed(0)}%`}
          ctx={`${snapshot.highRiskItemsCount} high-risk items`}
          tone={scheduleTone}
        />
      </div>

      {/* Hero body: portfolio rollup (left) · risk radar + digests (right). */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2 lg:divide-x lg:divide-line-soft">
        {/* Left — portfolio health rollup. */}
        <section className="lg:pr-8">
          <h3 className="mb-3.5 flex items-baseline gap-2.5 font-display text-[22px] text-ink">
            Portfolio{" "}
            <span className="text-accent">
              · {total} {total === 1 ? "project" : "projects"}
            </span>
          </h3>
          <div className="flex flex-col gap-2.5">
            <HealthRow
              name="On track"
              stage={`${projHealth.breakdown.onTrack} active`}
              meta={`${projHealth.healthPct.toFixed(0)}% on time · budget burn ${budgetBurn.value}`}
              pct={projHealth.healthPct}
              tone="ok"
            />
            <HealthRow
              name="Needs attention"
              stage={`${projHealth.breakdown.atRisk} at risk`}
              meta={`${snapshot.highRiskItemsCount} high-risk items · ${snapshot.pendingChangeOrders} change orders`}
              pct={
                total > 0 ? (projHealth.breakdown.atRisk / total) * 100 : 0
              }
              tone="warn"
            />
            <HealthRow
              name="Delayed"
              stage={`${projHealth.breakdown.delayed} delayed`}
              meta={`${snapshot.identifiedCashGapsCount} cash gaps · runway ${runway.value}`}
              pct={
                total > 0 ? (projHealth.breakdown.delayed / total) * 100 : 0
              }
              tone="danger"
            />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            <MiniStat label="cash 60d" value={cashGap60} />
            <MiniStat label="cash 90d" value={cashGap90} />
            <MiniStat label="QA/QC open" value={qaqc.value} />
          </div>

          {receivables ? (
            <div className="mt-5 rounded-md bg-surface border border-line-soft px-4 py-[13px]">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-tertiary">
                Receivables aging
              </div>
              <div className="mt-2.5 grid grid-cols-4 gap-2.5">
                <Aging
                  k="current"
                  v={formatMinorAsCurrency(receivables.current, baseCurrency)}
                />
                <Aging
                  k="1–30d"
                  v={formatMinorAsCurrency(
                    receivables.days_1_30,
                    baseCurrency,
                  )}
                />
                <Aging
                  k="31–60d"
                  v={formatMinorAsCurrency(
                    receivables.days_31_60,
                    baseCurrency,
                  )}
                />
                <Aging
                  k=">90d"
                  v={formatMinorAsCurrency(
                    receivables.days_over_90,
                    baseCurrency,
                  )}
                  tone="warn"
                />
              </div>
            </div>
          ) : null}
        </section>

        {/* Right — risk radar + daily digests. */}
        <section className="lg:pl-8">
          <h3 className="mb-3.5 flex items-baseline gap-2.5 font-display text-[22px] text-ink">
            Risk radar <span className="text-accent">· {alerts.length}</span>
          </h3>
          <div className="rounded-md bg-surface border border-line-soft px-4 py-1">
            {alerts.length === 0 ? (
              <p className="py-3 text-sm text-ink-tertiary">No open alerts.</p>
            ) : (
              alerts.map((a) => {
                const tone = sevTone(a.severity);
                const badge = SEV_BADGE[tone];
                return (
                  <Link
                    key={a.id}
                    href={`/development-os/risk-radar/${a.alertCode}`}
                    className="grid grid-cols-[28px_1fr_auto] items-center gap-2.5 border-b border-line-soft py-2.5 last:border-b-0 hover:opacity-80"
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-[5px] font-display text-[11px] ${badge.box}`}
                    >
                      {badge.glyph}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-ink">
                        {a.title}
                      </span>
                      <span className="mt-px block truncate font-mono text-[10px] text-ink-tertiary">
                        {a.alertCategory.replace(/_/g, " ")}
                      </span>
                    </span>
                    <span className="text-right font-mono text-[10.5px] uppercase text-ink-tertiary">
                      {a.severity}
                    </span>
                  </Link>
                );
              })
            )}
          </div>

          <h3 className="mb-3.5 mt-[22px] flex items-baseline gap-2.5 font-display text-[22px] text-ink">
            Daily digests{" "}
            <span className="text-accent">· {digests.length}</span>
          </h3>
          {digests.length === 0 ? (
            <p className="rounded-md bg-surface border border-line-soft px-3.5 py-[11px] text-xs text-ink-tertiary">
              No digest yet — the monthly digest cron will create one on the
              1st.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {digests.map((d) => (
                <Link
                  key={d.id}
                  href="/development-os/digests"
                  className="block rounded-md bg-surface border border-line-soft px-3.5 py-[11px] text-xs leading-relaxed text-ink-secondary hover:bg-muted/40"
                >
                  <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-tertiary">
                    {d.periodLabel} ·{" "}
                    {formatDistanceToNowStrict(new Date(d.periodEnd))} ago
                  </span>
                  <span className="font-medium text-ink">{d.periodLabel}</span>{" "}
                  {d.executiveSummary}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </DevelopmentShell>
  );
}

function ExecutiveHeader({
  title,
  emphasis,
  sub,
  actions,
}: {
  title: string;
  emphasis?: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-baseline gap-6">
      <div className="min-w-0">
        <h1 className="font-display text-[32px] leading-tight text-ink">
          {title}
          {emphasis ? <em className="not-italic text-accent"> {emphasis}</em> : null}
        </h1>
        {sub ? (
          <p className="mt-1.5 text-[13.5px] text-ink-secondary">{sub}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface border border-line-soft px-3 py-2.5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary">
        {label}
      </div>
      <div className="mt-0.5 font-display text-[20px] leading-none text-ink">
        {value}
      </div>
    </div>
  );
}

function Aging({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "warn";
}) {
  return (
    <div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-tertiary">
        {k}
      </div>
      <div
        className={`mt-0.5 font-mono text-[13px] ${tone === "warn" ? "text-warning" : "text-ink"}`}
      >
        {v}
      </div>
    </div>
  );
}
