/**
 * Sprint 1 — DonutRatioCard shared types.
 *
 * Pure type module (no recharts) shared by the lazy `next/dynamic`
 * wrapper (`donut-ratio-card.tsx`) and the recharts implementation
 * (`donut-ratio-card-impl.tsx`).
 */

export type DonutTone =
  // Legacy (5 existing consumer files)
  | "emerald"
  | "gold"
  | "coral"
  | "sage"
  | "terracotta"
  // Arconique OS redesign tones (additive)
  | "terra"
  | "olive"
  | "sea"
  | "sand";

export interface DonutRatioCardProps {
  title: string;
  numerator: number;
  denominator: number;
  tone?: DonutTone;
  /**
   * Optional change vs prior period, in percentage points
   * (e.g. +3.2 means "up 3.2pp"). Rendered as a coloured pill.
   */
  changePercent?: number;
  /** Optional caption under the ratio (e.g. "of 38 villas occupied"). */
  caption?: string;
  /** Optional right-aligned accessory in the header. */
  accessory?: React.ReactNode;
  className?: string;
}
