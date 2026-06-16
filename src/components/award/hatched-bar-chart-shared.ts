/**
 * Sprint 4 — HatchedBarChart shared types.
 *
 * Pure type module (no recharts) shared by the lazy `next/dynamic`
 * wrapper (`hatched-bar-chart.tsx`) and the recharts implementation
 * (`hatched-bar-chart-impl.tsx`).
 */

import type { FormatSpec } from "./format-specs";

export type HatchedBarTone = "emerald" | "gold" | "sage" | "terracotta";

export interface HatchedBarDatum {
  label: string;
  value: number;
  /**
   * Render style for this bar:
   *   "active"   → solid tone fill (default)
   *   "inactive" → hatched fill (track-only look)
   */
  status?: "active" | "inactive";
  /** Optional caption shown above the bar (e.g. "74%"). */
  caption?: string;
}

export interface HatchedBarChartProps {
  data: HatchedBarDatum[];
  tone?: HatchedBarTone;
  /**
   * If set, the bar at this index renders a small callout chip above
   * it (e.g. "74%"). Overrides per-datum `caption` for convenience.
   */
  highlightIndex?: number;
  /** Pixel height for the chart area. Defaults to 220. */
  height?: number;
  /**
   * Tooltip value formatting. Serialisable across the RSC boundary
   * so server-component consumers can pass it safely. Pair with
   * `valuePrefix` / `valueSuffix` for non-Intl currency labels.
   */
  formatSpec?: FormatSpec;
  valuePrefix?: string;
  valueSuffix?: string;
  className?: string;
}
