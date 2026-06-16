/**
 * Sprint 1 — SparklineChart recharts implementation.
 *
 * Split out of `sparkline-chart.tsx` so the recharts library is loaded
 * lazily (the public `SparklineChart` is a `next/dynamic({ ssr:false })`
 * wrapper around this module). Keeps recharts out of the eager client
 * bundle for every page that imports a sparkline.
 */

"use client";

import * as React from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { SparklineChartProps, SparklineTone } from "./sparkline-chart-shared";

const TONE_VAR: Record<SparklineTone, string> = {
  emerald: "var(--data-emerald)",
  gold: "var(--data-gold)",
  sage: "var(--data-sage)",
  terracotta: "var(--data-terracotta)",
  stone: "var(--data-stone)",
  ink: "var(--ink)",
};

export function SparklineChartImpl({
  data,
  tone = "emerald",
  height = 32,
  className,
}: SparklineChartProps) {
  // Stable gradient id per render so multiple sparklines on a page don't
  // collide. React.useId is stable across SSR/hydration; must be called
  // unconditionally before any early return (rules-of-hooks).
  const gradientId = `sparkline-grad-${React.useId().replace(/:/g, "")}`;
  if (!data || data.length < 2) return null;
  const color = TONE_VAR[tone];
  const series = data.map((v, i) => ({ i, v }));

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
