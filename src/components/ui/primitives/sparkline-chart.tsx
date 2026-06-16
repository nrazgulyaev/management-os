/**
 * Sprint 1 — SparklineChart primitive (lazy wrapper).
 *
 * Recharts-based replacement for the hand-rolled `<Sparkline>` SVG. Lives
 * alongside the original (which stays as a zero-dep fallback) so existing
 * call-sites are untouched.
 *
 * client-tax: the recharts render lives in `sparkline-chart-impl.tsx` and
 * is loaded via `next/dynamic({ ssr:false })` so the ~heavy recharts
 * library no longer ships eagerly to every page that mounts a sparkline.
 * The named-export API (`SparklineChart`, `SparklineChartProps`,
 * `SparklineTone`) is unchanged, so all call-sites keep working.
 *
 * Intended use: drop into the `sparkline?: React.ReactNode` slot on
 * `<DashboardKpi>` to give every cabinet KPI a real trend line.
 *
 * Tones map to the `--data-*` design tokens (Stage 10.6.C.1 ramp):
 *   emerald · gold · sage · terracotta · stone · ink
 */

"use client";

import dynamic from "next/dynamic";
import type {
  SparklineChartProps,
  SparklineTone,
} from "./sparkline-chart-shared";

export type { SparklineChartProps, SparklineTone };

const SparklineChartImpl = dynamic(
  () => import("./sparkline-chart-impl").then((m) => m.SparklineChartImpl),
  {
    ssr: false,
    // The impl owns its own wrapper div (with sizing/data attributes);
    // until it loads we render nothing — same as the original returning
    // null before the chart was ready.
    loading: () => null,
  },
);

export function SparklineChart(props: SparklineChartProps) {
  // The impl returns null for <2 points; mirror that early-out here so an
  // empty series never triggers loading the recharts chunk at all.
  if (!props.data || props.data.length < 2) return null;
  return <SparklineChartImpl {...props} />;
}
