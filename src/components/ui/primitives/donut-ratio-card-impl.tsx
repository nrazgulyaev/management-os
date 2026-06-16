/**
 * Sprint 1 — DonutRatioCard recharts implementation.
 *
 * Split out of `donut-ratio-card.tsx` so recharts loads lazily (the
 * public `DonutRatioCard` is a `next/dynamic({ ssr:false })` wrapper
 * around this module). Behaviour is identical to the original.
 */

"use client";

import * as React from "react";
import { Pie, PieChart, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { DonutRatioCardProps, DonutTone } from "./donut-ratio-card-shared";

const TONE_BG: Record<DonutTone, string> = {
  // Legacy gradients
  emerald: "bg-gradient-emerald-soft",
  gold: "bg-gradient-gold-soft",
  coral: "bg-gradient-coral-soft",
  sage: "bg-gradient-emerald-soft",
  terracotta: "bg-gradient-coral-soft",
  // Redesign tinted backgrounds
  terra: "bg-terra-tint",
  olive: "bg-olive-tint",
  sea: "bg-sea-tint",
  sand: "bg-sand-soft",
};

const TONE_FILL: Record<DonutTone, string> = {
  // Legacy data-* palette
  emerald: "var(--data-emerald)",
  gold: "var(--data-gold)",
  coral: "var(--data-terracotta)",
  sage: "var(--data-sage)",
  terracotta: "var(--data-terracotta)",
  // Redesign brand-axis fills
  terra: "var(--color-terra)",
  olive: "var(--color-olive)",
  sea: "var(--color-sea)",
  sand: "var(--color-terra)",
};

export function DonutRatioCardImpl({
  title,
  numerator,
  denominator,
  tone = "emerald",
  changePercent,
  caption,
  accessory,
  className,
}: DonutRatioCardProps) {
  const ratio =
    denominator > 0
      ? Math.max(0, Math.min(1, numerator / denominator))
      : 0;
  const pct = Math.round(ratio * 1000) / 10; // 1-dp percentage
  const fill = TONE_FILL[tone];

  // Two-slice donut: filled portion + remainder. Single visual segment
  // by design — the remainder is rendered in a low-opacity neutral so
  // the "story" reads as a proportion.
  const data = [
    { name: "value", value: ratio || 0.001 },
    { name: "rest", value: 1 - (ratio || 0.001) },
  ];

  const trend =
    typeof changePercent === "number"
      ? changePercent > 0
        ? "up"
        : changePercent < 0
          ? "down"
          : "flat"
      : null;
  const trendCls =
    trend === "up"
      ? "bg-success-weak text-success"
      : trend === "down"
        ? "bg-danger-weak text-danger"
        : "bg-muted text-ink-tertiary";

  return (
    <div
      className={cn(
        "rounded-3xl border border-line-soft shadow-soft-card p-6 md:p-7 flex flex-col gap-5",
        TONE_BG[tone],
        className,
      )}
      data-stage10="donut-ratio-card"
      data-tone={tone}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink">
          {title}
        </h3>
        {accessory && <div className="shrink-0">{accessory}</div>}
      </header>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-display text-[40px] md:text-[48px] leading-[1.0] font-medium text-ink">
              {numerator.toLocaleString()}
            </span>
            <span className="text-ink-tertiary text-base">
              / {denominator.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-ink-secondary font-medium tabular-nums">
              {pct.toFixed(1)}%
            </span>
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                  trendCls,
                )}
              >
                {trend === "up" ? "▲" : trend === "down" ? "▼" : "•"}
                {Math.abs(changePercent!).toFixed(1)}
                pp
              </span>
            )}
          </div>
          {caption && (
            <p className="text-xs text-ink-tertiary leading-relaxed">
              {caption}
            </p>
          )}
        </div>

        <div className="relative shrink-0 w-[120px] h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={36}
                outerRadius={52}
                startAngle={90}
                endAngle={-270}
                stroke="none"
                isAnimationActive={false}
              >
                <Cell fill={fill} />
                <Cell fill="rgba(15,17,16,0.08)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-mono tabular-nums text-ink font-medium">
            {pct.toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
}
