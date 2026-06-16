/**
 * Sprint 4 — HatchedBarChart primitive (lazy wrapper).
 *
 * Reference 2 "Project Analytics" pattern: vertical bars where some
 * are solid filled (active days) and others are diagonal-hatched
 * (inactive / historical). Built on Recharts with a custom `shape`
 * renderer so each datum picks its own fill style.
 *
 * Optional `highlightIndex` adds a small "74%" callout above one bar.
 *
 * client-tax: the recharts render lives in `hatched-bar-chart-impl.tsx`
 * and is loaded via `next/dynamic({ ssr:false })` so recharts no longer
 * ships eagerly. A same-height skeleton is shown while the chunk loads.
 * The named-export API is unchanged so call-sites keep working.
 */

"use client";

import dynamic from "next/dynamic";
import type {
  HatchedBarChartProps,
  HatchedBarDatum,
  HatchedBarTone,
} from "./hatched-bar-chart-shared";

export type { HatchedBarChartProps, HatchedBarDatum, HatchedBarTone };

const HatchedBarChartImpl = dynamic(
  () => import("./hatched-bar-chart-impl").then((m) => m.HatchedBarChartImpl),
  {
    ssr: false,
    // The impl owns its own sized wrapper div (with className + data
    // attributes); render nothing until the chunk resolves.
    loading: () => null,
  },
);

export function HatchedBarChart(props: HatchedBarChartProps) {
  return <HatchedBarChartImpl {...props} />;
}
