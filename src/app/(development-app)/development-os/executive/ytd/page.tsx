import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";
import { listCompanySnapshotsInRange } from "@/lib/development/server/executive/metrics-queries";
import { listAlertsInRange } from "@/lib/development/server/risk-radar/risk-radar-queries";
import { listDigestsInRange } from "@/lib/development/server/executive-digest/digest-queries";
import { formatMinorAsCurrency } from "@/lib/development/server/executive/widgets-helpers";
import {
  computeTimeRangeRollup,
  ytdBounds,
  type RangeSnapshot,
} from "@/lib/development/server/executive/time-range-rollup";
import {
  HistoryAccrualNote,
  LedgerRow,
  RollupKpi,
  RollupSectionHeading,
} from "../_rollup-shared";

export const metadata: Metadata = {
  title: "Executive · YTD · Development OS",
};
export const dynamic = "force-dynamic";

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

export default async function ExecutiveYtdPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <RangeHeader title="Executive" emphasis="· YTD" sub="" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }

  const now = new Date();
  const { start, end, label } = ytdBounds(now);
  const monthsElapsed = now.getUTCMonth() + 1;

  const [snapshotRows, alerts, digests] = await Promise.all([
    safeQuery(
      "listCompanySnapshotsInRange:ytd",
      listCompanySnapshotsInRange(start, end),
      [],
    ),
    safeQuery("listAlertsInRange:ytd", listAlertsInRange(start, end), []),
    safeQuery("listDigestsInRange:ytd", listDigestsInRange(start, end), []),
  ]);

  const rollup = computeTimeRangeRollup(
    snapshotRows.map(toRangeSnapshot),
    alerts.map((a) => ({ severity: a.severity, detectedAt: a.detectedAt })),
  );

  const cur = rollup.baseCurrency;
  const fmt = (v: number | null) =>
    v == null ? "—" : formatMinorAsCurrency(v, cur);

  const cashDeltaTone =
    rollup.cashDeltaMinor == null
      ? "ink"
      : rollup.cashDeltaMinor >= 0
        ? "ok"
        : "danger";

  const drawnPct =
    rollup.committedCapitalMinor && rollup.committedCapitalMinor > 0
      ? ((rollup.drawnCapitalMinor ?? 0) / rollup.committedCapitalMinor) * 100
      : 0;

  const sub = [
    `${label} · ${monthsElapsed} month${monthsElapsed === 1 ? "" : "s"}`,
    `${rollup.snapshotCount} snapshot${rollup.snapshotCount === 1 ? "" : "s"} in range`,
    `${rollup.risk.high} high-severity risk${rollup.risk.high === 1 ? "" : "s"} this year`,
  ].join(" · ");

  return (
    <DevelopmentShell>
      <RangeHeader
        title="Executive"
        emphasis={`· ${label}`}
        sub={sub}
        actions={
          <>
            <Link
              href="/development-os/executive"
              className="inline-flex items-center rounded-md border border-line-soft bg-surface px-[14px] py-[9px] text-[13.5px] font-medium text-ink-secondary hover:bg-muted/60"
            >
              Monthly
            </Link>
            <Link
              href="/development-os/executive/quarterly"
              className="inline-flex items-center rounded-md border border-line-soft bg-surface px-[14px] py-[9px] text-[13.5px] font-medium text-ink-secondary hover:bg-muted/60"
            >
              Quarterly
            </Link>
          </>
        }
      />

      <HistoryAccrualNote
        snapshotCount={rollup.snapshotCount}
        rangeLabel={label}
      />

      {/* YTD headline KPIs — variant C of the exec mock. */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <RollupKpi
          label="cashflow YTD"
          value={fmt(rollup.cashDeltaMinor)}
          ctx={`cumulative across ${monthsElapsed} mo`}
          tone={cashDeltaTone}
        />
        <RollupKpi
          label="GMV pipeline"
          value={fmt(rollup.pipelineValueMinor)}
          ctx={`${rollup.contractsSigned} contract${rollup.contractsSigned === 1 ? "" : "s"} signed`}
        />
        <RollupKpi
          label="capital raised"
          value={fmt(rollup.committedCapitalMinor)}
          ctx={`${drawnPct.toFixed(0)}% drawn`}
          tone="ok"
        />
        <RollupKpi
          label="distributions"
          value={fmt(rollup.pendingDistributionMinor)}
          ctx="pending to investors"
        />
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2 lg:divide-x lg:divide-line-soft">
        {/* Left — full-year ledger. */}
        <section className="lg:pr-8">
          <RollupSectionHeading accent={label}>Year-to-date ledger</RollupSectionHeading>
          <div className="flex flex-col gap-2">
            <LedgerRow
              label="Cashflow · cumulative"
              value={fmt(rollup.cashDeltaMinor)}
              tone={cashDeltaTone}
            />
            <LedgerRow
              label="Ending cash on hand"
              value={fmt(rollup.endingCashMinor)}
            />
            <LedgerRow
              label="GMV pipeline"
              value={fmt(rollup.pipelineValueMinor)}
            />
            <LedgerRow
              label="Capital raised"
              value={fmt(rollup.committedCapitalMinor)}
            />
            <LedgerRow
              label="Capital drawn"
              value={fmt(rollup.drawnCapitalMinor)}
            />
            <LedgerRow
              label="Distributions pending"
              value={fmt(rollup.pendingDistributionMinor)}
            />
            <LedgerRow
              label="Contracts signed"
              value={`${rollup.contractsSigned}`}
            />
          </div>
        </section>

        {/* Right — risk posture + digests across the year. */}
        <section className="lg:pl-8">
          <RollupSectionHeading accent={rollup.risk.total}>
            Risk posture · YTD
          </RollupSectionHeading>
          <div className="grid grid-cols-3 gap-2.5">
            <MiniStat label="high" value={`${rollup.risk.high}`} tone="danger" />
            <MiniStat label="medium" value={`${rollup.risk.medium}`} tone="warn" />
            <MiniStat label="low" value={`${rollup.risk.low}`} />
          </div>
          <p className="mt-2.5 font-mono text-[10.5px] text-ink-tertiary">
            Alerts detected since {start.toISOString().slice(0, 10)}.{" "}
            <Link
              href="/development-os/risk-radar"
              className="text-accent hover:underline"
            >
              Open risk radar →
            </Link>
          </p>

          <RollupSectionHeading accent={digests.length}>
            Digests this year
          </RollupSectionHeading>
          {digests.length === 0 ? (
            <p className="rounded-md border border-line-soft bg-surface px-3.5 py-[11px] text-xs text-ink-tertiary">
              No digests cover this year yet — the monthly digest job drafts
              one per month.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {digests.map((d) => (
                <Link
                  key={d.id}
                  href={`/development-os/digests/${d.digestCode}`}
                  className="block rounded-md border border-line-soft bg-surface px-3.5 py-[11px] text-xs leading-relaxed text-ink-secondary hover:bg-muted/40"
                >
                  <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-tertiary">
                    {d.periodLabel}
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

function RangeHeader({
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
          {emphasis ? (
            <em className="not-italic text-accent"> {emphasis}</em>
          ) : null}
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

function MiniStat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-warning"
        : "text-ink";
  return (
    <div className="rounded-md border border-line-soft bg-surface px-3 py-2.5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 font-display text-[20px] leading-none ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
