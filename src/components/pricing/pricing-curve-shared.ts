/**
 * Phase 2.4 seed — PricingCurve shared types.
 *
 * Pure type module (no recharts) shared by the lazy `next/dynamic`
 * wrapper (`pricing-curve.tsx`), its recharts implementation
 * (`pricing-curve-impl.tsx`), and the `server-only` pricing query layer
 * (`@/features/pricing/queries`). Splitting the types out keeps recharts
 * out of any module that only needs the shapes.
 */

export interface PricingCurveOverride {
  date: Date;
  value: number;
  pinned: boolean;
}

export interface PricingCurveEvent {
  date: Date;
  label: string;
  severity?: "normal" | "high";
}

export interface PricingCurveSeries {
  algo: { date: Date; value: number }[];
  active: { date: Date; value: number }[];
  lastYear?: { date: Date; value: number }[];
  compMedian?: { date: Date; value: number }[];
}

export interface PricingCurveProps {
  series: PricingCurveSeries;
  events?: PricingCurveEvent[];
  overrides?: PricingCurveOverride[];
  onOverrideDrag?: (date: Date, newValue: number) => void;
  period: "30d" | "90d" | "365d";
  title?: string;
  height?: number;
  className?: string;
}
