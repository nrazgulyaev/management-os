/**
 * UNIT build-workspace-roleviews — shared compact USD formatter.
 *
 * Pure helper (no I/O, no "server-only") so both the landing role
 * switcher and the workspace project drill render USD-minor amounts with
 * the SAME convention the CFO cabinet established:
 * `$1.2M` / `$184K` / `$612` / `—` for null.
 */

const USD_MINOR_PER_K = 100_000;
const USD_MINOR_PER_M = 100_000_000;

/** USD-minor → "$1.2M" / "$184K" / "$612" (compact). */
export function usdCompact(minor: number | null | undefined): string {
  if (minor == null || !Number.isFinite(minor)) return "—";
  const abs = Math.abs(minor);
  if (abs >= USD_MINOR_PER_M) return `$${(minor / USD_MINOR_PER_M).toFixed(1)}M`;
  if (abs >= USD_MINOR_PER_K) return `$${Math.round(minor / USD_MINOR_PER_K)}K`;
  if (abs === 0) return "$0";
  return `$${Math.round(minor / 100).toLocaleString()}`;
}
