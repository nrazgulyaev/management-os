/**
 * Sprint 1 — AreaChartCard shared types.
 *
 * Pure type module (no recharts) shared by the lazy `next/dynamic`
 * wrapper (`area-chart-card.tsx`) and the recharts implementation
 * (`area-chart-card-impl.tsx`). Keeps the public types importable
 * without pulling recharts into the bundle.
 */

import type { FormatSpec } from "@/components/award/format-specs";

export type AreaChartTone =
  // Legacy 10.6.C.1 tones (7 existing consumer files)
  | "emerald"
  | "gold"
  | "coral"
  | "sage"
  | "terracotta"
  | "ink"
  // Arconique OS redesign tones (additive). The terra default
  // matches the handoff's "primary chart line is terra" rule
  // (DESIGN_TOKENS.md §Color usage).
  | "terra"
  | "olive"
  | "sea"
  | "sand"
  | "warm";

export interface AreaChartPoint {
  date: string;
  value: number;
}

export interface PinnedTooltipSpec {
  /** Pre-formatted value string (e.g. "Rp 86M"). */
  value: string;
  /** Caption under the value (e.g. "Tue 23 Apr · peak"). */
  label?: string;
}

export interface AreaChartCardProps {
  title: string;
  /** Optional eyebrow (period label, "Monthly", etc.). */
  period?: string;
  data: AreaChartPoint[];
  tone?: AreaChartTone;
  /** Optional pinned capsule pointing at the series peak. */
  pinnedTooltip?: PinnedTooltipSpec;
  /** Optional right-aligned accessory in the header (e.g. period switcher). */
  accessory?: React.ReactNode;
  /** Pixel height of the chart area. Defaults to 200. */
  chartHeight?: number;
  /**
   * Hover-tooltip value formatting. Serialisable across the RSC
   * boundary — server-component consumers can pass this safely.
   * Pair with `valuePrefix` / `valueSuffix` for currency labels that
   * `Intl.NumberFormat` doesn't cover (e.g. "Rp …B").
   */
  formatSpec?: FormatSpec;
  valuePrefix?: string;
  valueSuffix?: string;
  className?: string;
}
