/**
 * Sprint 1 — SparklineChart primitive.
 *
 * Recharts-based replacement for the hand-rolled `<Sparkline>` SVG. Lives
 * alongside the original (which stays as a zero-dep fallback) so existing
 * call-sites are untouched.
 *
 * Intended use: drop into the `sparkline?: React.ReactNode` slot on
 * `<DashboardKpi>` to give every cabinet KPI a real trend line.
 *
 * Tones map to the `--data-*` design tokens (Stage 10.6.C.1 ramp):
 *   emerald · gold · sage · terracotta · stone · ink
 */

"use client";

import * as React from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export type SparklineTone =
  | "emerald"
  | "gold"
  | "sage"
  | "terracotta"
  | "stone"
  | "ink";

const TONE_VAR: Record<SparklineTone, string> = {
  emerald: "var(--data-emerald)",
  gold: "var(--data-gold)",
  sage: "var(--data-sage)",
  terracotta: "var(--data-terracotta)",
  stone: "var(--data-stone)",
  ink: "var(--ink)",
};

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

export function SparklineChart({
  data,
  tone = "emerald",
  height = 32,
  className,
}: SparklineChartProps) {
  if (!data || data.length < 2) return null;
  const color = TONE_VAR[tone];
  const series = data.map((v, i) => ({ i, v }));
  // Stable gradient id per render so multiple sparklines on a page don't
  // collide. React.useId is stable across SSR/hydration.
  const gradientId = `sparkline-grad-${React.useId().replace(/:/g, "")}`;

  return (
    <div
      className={cn("w-full", className)}
      style={{ height }}
      data-stage10="sparkline-chart"
      data-tone={tone}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            fillOpacity={1}
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
