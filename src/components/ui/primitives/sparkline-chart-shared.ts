/**
 * Sprint 1 — SparklineChart shared types.
 *
 * Pure type module (no recharts) shared by the lazy `next/dynamic`
 * wrapper (`sparkline-chart.tsx`) and the recharts implementation
 * (`sparkline-chart-impl.tsx`). Keeps the public prop/tone types
 * importable without pulling recharts into the bundle.
 */

export type SparklineTone =
  | "emerald"
  | "gold"
  | "sage"
  | "terracotta"
  | "stone"
  | "ink";

export interface SparklineChartProps {
  /** Numeric series, ordered oldest → newest. 0 or 1 point renders nothing. */
  data: number[];
  /** Stroke / fill color. Defaults to emerald. */
  tone?: SparklineTone;
  /** Chart height in pixels. Defaults to 32. */
  height?: number;
  /** Optional className passthrough (applied to the wrapper div). */
  className?: string;
}
