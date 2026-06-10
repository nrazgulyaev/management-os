/**
 * Pure rollup + spike helpers for the Utilities cabinet (no
 * `server-only` import — safe for tests and client bundles).
 *
 * Data model honesty notes:
 *  - "Usage" comes only from `utility_readings` rows with
 *    `reading_type = 'meter'` (cumulative meter values). Monthly
 *    consumption = delta between the last meter value of ADJACENT
 *    calendar months. Months with no reading, or a meter reset
 *    (negative delta), produce no consumption point.
 *  - "Billed" comes from `utility_payment_reminders` amounts grouped
 *    by due-date month (cancelled reminders excluded by callers).
 *  - Spike thresholds mirror the design mock: +50% month-over-month
 *    = danger, +15% = warn. A spike is only flagged when two
 *    ADJACENT months of real consumption exist — no baseline, no flag.
 */

export interface MeterPoint {
  /** ISO timestamp of the reading. */
  readingAt: string;
  /** Cumulative meter value. */
  readingValue: number;
}

export interface ConsumptionPoint {
  /** Month key, `YYYY-MM`. */
  month: string;
  /** Units consumed during that month (meter delta). */
  units: number;
}

export interface SpikeFlag {
  /** Fractional change vs the previous month, e.g. 0.64 = +64%. */
  pct: number;
  severity: "warn" | "danger";
  /** Month key (`YYYY-MM`) of the spiking month. */
  month: string;
}

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

/** `2026-06-10T…` → `2026-06`. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** `2026-06` → `jun '26`. */
export function monthLabel(key: string): string {
  const y = key.slice(2, 4);
  const m = Number(key.slice(5, 7));
  const name = MONTH_NAMES[m - 1] ?? key.slice(5, 7);
  return `${name} '${y}`;
}

/** Month index for adjacency math: year*12 + (month-1). */
function monthIndex(key: string): number {
  return Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1);
}

/** The last `n` month keys ending with the current month, ascending. */
export function lastNMonthKeys(n: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return keys;
}

/**
 * Per-month consumption from cumulative meter points. Points may
 * arrive in any order; only deltas between adjacent calendar months
 * are emitted, and negative deltas (meter reset / re-keyed meter)
 * are dropped.
 */
export function monthlyConsumption(points: MeterPoint[]): ConsumptionPoint[] {
  if (points.length < 2) return [];
  const sorted = [...points].sort((a, b) =>
    a.readingAt < b.readingAt ? -1 : 1,
  );
  // Last meter value per month.
  const lastPerMonth = new Map<string, number>();
  for (const p of sorted) lastPerMonth.set(monthKey(p.readingAt), p.readingValue);
  const months = [...lastPerMonth.keys()].sort();
  const out: ConsumptionPoint[] = [];
  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1];
    const cur = months[i];
    if (monthIndex(cur) - monthIndex(prev) !== 1) continue; // gap → unknown
    const delta = lastPerMonth.get(cur)! - lastPerMonth.get(prev)!;
    if (delta < 0) continue; // meter reset → unknown
    out.push({ month: cur, units: delta });
  }
  return out;
}

/**
 * Month-over-month spike on the two most recent ADJACENT consumption
 * months. Returns null when the data cannot support a verdict
 * (fewer than two adjacent months, or zero baseline).
 */
export function detectSpike(consumption: ConsumptionPoint[]): SpikeFlag | null {
  if (consumption.length < 2) return null;
  const sorted = [...consumption].sort((a, b) => (a.month < b.month ? -1 : 1));
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  if (monthIndex(latest.month) - monthIndex(prev.month) !== 1) return null;
  if (prev.units <= 0) return null;
  const pct = (latest.units - prev.units) / prev.units;
  if (pct >= 0.5) return { pct, severity: "danger", month: latest.month };
  if (pct >= 0.15) return { pct, severity: "warn", month: latest.month };
  return null;
}

/** Sum minor-unit amounts per `YYYY-MM` month key. */
export function sumAmountsByMonth(
  rows: { month: string; amountMinor: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.month, (out.get(r.month) ?? 0) + r.amountMinor);
  return out;
}

/**
 * Sum minor-unit amounts grouped by currency, formatted for display
 * (`IDR 1,234 · USD 56`). Returns "—" when nothing to sum.
 */
export function sumByCurrencyLabel(
  items: { amountMinor: number | null; currency: string | null }[],
): string {
  const sums = new Map<string, number>();
  for (const it of items) {
    if (it.amountMinor == null) continue;
    const ccy = it.currency ?? "IDR";
    sums.set(ccy, (sums.get(ccy) ?? 0) + it.amountMinor);
  }
  if (sums.size === 0) return "—";
  return [...sums.entries()]
    .map(([ccy, minor]) => formatMoneyMinor(minor, ccy))
    .join(" · ");
}

/** `123456, "IDR"` → `IDR 1,235` (major units, rounded). */
export function formatMoneyMinor(
  minor: number | null,
  currency: string | null,
): string {
  if (minor == null) return "—";
  return `${currency ?? ""} ${Math.round(minor / 100).toLocaleString("en-US")}`.trim();
}

/** `0.643` → `+64%`; `-0.04` → `−4%`. */
export function formatPct(pct: number): string {
  const rounded = Math.round(pct * 100);
  return rounded >= 0 ? `+${rounded}%` : `−${Math.abs(rounded)}%`;
}

/** Short chip label per utility type (mock vocabulary). */
export function utilityTypeShort(type: string): string {
  switch (type) {
    case "electricity":
      return "elec";
    case "internet":
      return "net";
    case "security":
      return "sec";
    default:
      return type;
  }
}
