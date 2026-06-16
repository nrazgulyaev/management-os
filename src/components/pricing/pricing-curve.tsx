"use client";

/**
 * Phase 2.4 seed — PricingCurve (lazy wrapper).
 *
 * Recharts LineChart wrapper. Plots algo / active / lastYear /
 * compMedian series with optional event markers + draggable
 * override pins.
 *
 * client-tax: the recharts render lives in `pricing-curve-impl.tsx` and
 * is loaded via `next/dynamic({ ssr:false })` so recharts no longer
 * ships eagerly to any page that mounts this curve. The named-export API
 * (`PricingCurve` + its prop/series types) is unchanged so call-sites
 * keep working; the types are re-exported from `pricing-curve-shared`.
 *
 * See src/styles/components/p24-primitives.css for .pc-* classes.
 */

import dynamic from "next/dynamic";
import type {
  PricingCurveEvent,
  PricingCurveOverride,
  PricingCurveProps,
  PricingCurveSeries,
} from "./pricing-curve-shared";

export type {
  PricingCurveEvent,
  PricingCurveOverride,
  PricingCurveProps,
  PricingCurveSeries,
};

const PricingCurveImpl = dynamic(
  () => import("./pricing-curve-impl").then((m) => m.PricingCurveImpl),
  { ssr: false, loading: () => null },
);

export function PricingCurve(props: PricingCurveProps) {
  return <PricingCurveImpl {...props} />;
}
