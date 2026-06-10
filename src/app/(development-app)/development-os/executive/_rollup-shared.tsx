import type { ReactNode } from "react";

/**
 * Shared presentational pieces for the executive time-range rollups
 * (quarterly / YTD). Server-component friendly (no client hooks). All
 * values come from the page; this file owns only the visual mapping to
 * Development-OS Layer-B tokens.
 */

export type KpiTone = "ink" | "amber" | "ok" | "warn" | "danger";

const KPI_VALUE_TONE: Record<KpiTone, string> = {
  ink: "text-ink",
  amber: "text-accent",
  ok: "text-success",
  warn: "text-warning",
  danger: "text-danger",
};

/** Headline stat tile — mirrors the dashboard `.kpi-big` mock primitive. */
export function RollupKpi({
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
    <div className="rounded-md border border-line-soft bg-surface px-[18px] py-4">
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

/** A labelled line item inside the rollup ledger panel. */
export function LedgerRow({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: KpiTone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-md border border-line-soft bg-surface px-3.5 py-2.5">
      <span className="font-medium text-ink">{label}</span>
      <span
        className={`font-mono text-[13px] tabular-nums ${KPI_VALUE_TONE[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Honest disclosure banner. The historical series accrues one snapshot
 * per day, so a fresh org / sparse window cannot show real trend math —
 * we say so rather than fabricate history.
 */
export function HistoryAccrualNote({
  snapshotCount,
  rangeLabel,
}: {
  snapshotCount: number;
  rangeLabel: string;
}) {
  if (snapshotCount >= 2) {
    return (
      <p className="rounded-md border border-line-soft bg-surface px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-ink-tertiary">
        Based on {snapshotCount} daily snapshot
        {snapshotCount === 1 ? "" : "s"} captured in {rangeLabel}. The series
        deepens as the daily metrics job runs — trend math compares the
        earliest and latest snapshot in range.
      </p>
    );
  }
  return (
    <p className="rounded-md border border-warning-weak bg-warning-weak px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-warning">
      {snapshotCount === 0
        ? `No snapshots have landed in ${rangeLabel} yet.`
        : `Only one snapshot exists for ${rangeLabel} so far.`}{" "}
      The historical series accrues over time as the daily metrics job runs —
      period-over-period figures will populate as more snapshots are captured.
    </p>
  );
}

/** Section heading matching the dashboard `<h3>` rhythm. */
export function RollupSectionHeading({
  children,
  accent,
}: {
  children: ReactNode;
  accent?: ReactNode;
}) {
  return (
    <h3 className="mb-3.5 flex items-baseline gap-2.5 font-display text-[22px] text-ink">
      {children}
      {accent ? <span className="text-accent">· {accent}</span> : null}
    </h3>
  );
}
