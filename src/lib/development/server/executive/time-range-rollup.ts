/**
 * Pure rollup math for the executive time-range views (quarterly / YTD).
 *
 * The daily metrics cron writes ONE company-wide snapshot per day, so the
 * historical series accrues over time. These helpers fold whatever
 * snapshots have landed inside a window into a small set of headline
 * figures — and report `snapshotCount` so the page can render an honest
 * "history is still accruing" note when the series is thin or absent.
 *
 * No `server-only` guard so this stays unit-testable in isolation.
 *
 * All money is bigint MINOR units; we keep it as `number` of minor units
 * here (snapshots are summed/diffed, not multiplied) and format with the
 * shared `formatMinorAsCurrency` helper at the edge.
 */

export interface RangeSnapshot {
  snapshotDate: string;
  baseCurrency: string;
  totalCashOnHandMinor: number;
  totalPipelineValueMinor: number;
  totalCommittedCapitalMinor: number;
  totalDrawnCapitalMinor: number;
  pendingDistributionMinor: number;
  contractsSignedThisMonth: number;
  activeProjectsCount: number;
  projectsOnTrack: number;
  projectsAtRisk: number;
  projectsDelayed: number;
  highRiskItemsCount: number;
}

export interface RangeAlert {
  severity: string;
  detectedAt: Date | string;
}

export interface TimeRangeRollup {
  /** How many daily snapshots landed inside the window. */
  snapshotCount: number;
  baseCurrency: string;
  /** First / last snapshot dates actually present (ISO yyyy-mm-dd). */
  firstSnapshotDate: string | null;
  lastSnapshotDate: string | null;
  /** Latest cash-on-hand position in the window (point-in-time). */
  endingCashMinor: number | null;
  /** Change in cash-on-hand across the window (last − first). */
  cashDeltaMinor: number | null;
  /** Latest pipeline (GMV) value in the window (point-in-time). */
  pipelineValueMinor: number | null;
  /** Latest committed / drawn capital position in the window. */
  committedCapitalMinor: number | null;
  drawnCapitalMinor: number | null;
  /** Latest pending distribution position in the window. */
  pendingDistributionMinor: number | null;
  /** Contracts signed summed across the months covered by the window. */
  contractsSigned: number;
  /** Latest project-health breakdown in the window. */
  projectsOnTrack: number | null;
  projectsAtRisk: number | null;
  projectsDelayed: number | null;
  activeProjectsCount: number | null;
  highRiskItemsCount: number | null;
  /** Risk alerts raised inside the window, by severity bucket. */
  risk: { total: number; high: number; medium: number; low: number };
}

function severityBucket(sev: string): "high" | "medium" | "low" {
  if (sev === "critical" || sev === "high") return "high";
  if (sev === "medium") return "medium";
  return "low";
}

/**
 * Fold in-range snapshots + alerts into a single rollup. Snapshots must
 * be passed oldest-first (the query orders ascending).
 */
export function computeTimeRangeRollup(
  snapshots: RangeSnapshot[],
  alerts: RangeAlert[],
): TimeRangeRollup {
  const risk = { total: 0, high: 0, medium: 0, low: 0 };
  for (const a of alerts) {
    risk.total += 1;
    risk[severityBucket(a.severity)] += 1;
  }

  if (snapshots.length === 0) {
    return {
      snapshotCount: 0,
      baseCurrency: "IDR",
      firstSnapshotDate: null,
      lastSnapshotDate: null,
      endingCashMinor: null,
      cashDeltaMinor: null,
      pipelineValueMinor: null,
      committedCapitalMinor: null,
      drawnCapitalMinor: null,
      pendingDistributionMinor: null,
      contractsSigned: 0,
      projectsOnTrack: null,
      projectsAtRisk: null,
      projectsDelayed: null,
      activeProjectsCount: null,
      highRiskItemsCount: null,
      risk,
    };
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  // `contracts_signed_this_month` is a per-month counter. Sum it once per
  // distinct calendar month present in the window so multiple daily
  // snapshots in the same month don't double-count.
  const contractsByMonth = new Map<string, number>();
  for (const s of snapshots) {
    const monthKey = s.snapshotDate.slice(0, 7); // yyyy-mm
    contractsByMonth.set(monthKey, s.contractsSignedThisMonth);
  }
  let contractsSigned = 0;
  for (const v of contractsByMonth.values()) contractsSigned += v;

  return {
    snapshotCount: snapshots.length,
    baseCurrency: last.baseCurrency,
    firstSnapshotDate: first.snapshotDate,
    lastSnapshotDate: last.snapshotDate,
    endingCashMinor: last.totalCashOnHandMinor,
    cashDeltaMinor: last.totalCashOnHandMinor - first.totalCashOnHandMinor,
    pipelineValueMinor: last.totalPipelineValueMinor,
    committedCapitalMinor: last.totalCommittedCapitalMinor,
    drawnCapitalMinor: last.totalDrawnCapitalMinor,
    pendingDistributionMinor: last.pendingDistributionMinor,
    contractsSigned,
    projectsOnTrack: last.projectsOnTrack,
    projectsAtRisk: last.projectsAtRisk,
    projectsDelayed: last.projectsDelayed,
    activeProjectsCount: last.activeProjectsCount,
    highRiskItemsCount: last.highRiskItemsCount,
    risk,
  };
}

/** Inclusive `[start, end]` of the calendar month containing `ref`. */
export function monthBounds(ref: Date): {
  start: Date;
  end: Date;
  label: string;
} {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  // Last day of the month = day 0 of the following month.
  const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  const label = `${start.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${y}`;
  return { start, end, label };
}

/** Inclusive `[start, end]` of the calendar quarter containing `ref`. */
export function quarterBounds(ref: Date): {
  start: Date;
  end: Date;
  label: string;
} {
  const y = ref.getUTCFullYear();
  const q = Math.floor(ref.getUTCMonth() / 3); // 0..3
  const startMonth = q * 3;
  const start = new Date(Date.UTC(y, startMonth, 1));
  // Last day of the quarter = day 0 of the month after the quarter.
  const end = new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59, 999));
  return { start, end, label: `Q${q + 1} ${y}` };
}

/** Inclusive `[start, end]` from Jan 1 of `ref`'s year through `ref`. */
export function ytdBounds(ref: Date): {
  start: Date;
  end: Date;
  label: string;
} {
  const y = ref.getUTCFullYear();
  const start = new Date(Date.UTC(y, 0, 1));
  const end = new Date(
    Date.UTC(y, ref.getUTCMonth(), ref.getUTCDate(), 23, 59, 59, 999),
  );
  return { start, end, label: `YTD ${y}` };
}
