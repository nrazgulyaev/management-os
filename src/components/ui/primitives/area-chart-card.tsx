/**
 * Sprint 1 — AreaChartCard primitive.
 *
 * The "hero chart card" pattern from the doctor / logistics / crypto
 * reference dashboards: a gradient-toned rounded-3xl card with title,
 * optional period selector, and a softly-filled area chart. Optionally
 * surfaces a "pinned tooltip" capsule positioned at the series peak.
 *
 * Uses Stage 10.6.C.1 tokens:
 *   --gradient-emerald-soft / gold-soft / coral-soft / ink-deep
 *   --r-3xl, --shadow-soft-card
 *   --data-emerald / gold / sage / terracotta
 *
 * Server-friendly wrapper around a thin client chart shell.
 */

"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import { cn } from "@/lib/utils";
import {
  formatValueFromSpec,
  type FormatSpec,
} from "@/components/award/format-specs";

export type AreaChartTone =
  | "emerald"
  | "gold"
  | "coral"
  | "sage"
  | "terracotta"
  | "ink";

const TONE_BG: Record<AreaChartTone, string> = {
  emerald: "bg-gradient-emerald-soft",
  gold: "bg-gradient-gold-soft",
  coral: "bg-gradient-coral-soft",
  sage: "bg-gradient-emerald-soft",
  terracotta: "bg-gradient-coral-soft",
  ink: "bg-gradient-ink-deep text-ink-inverse",
};

const TONE_STROKE: Record<AreaChartTone, string> = {
  emerald: "var(--data-emerald)",
  gold: "var(--data-gold)",
  coral: "var(--data-terracotta)",
  sage: "var(--data-sage)",
  terracotta: "var(--data-terracotta)",
  ink: "var(--ink-inverse)",
};

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

function DefaultTooltip({
  active,
  payload,
  label,
  formatSpec,
  valuePrefix,
  valueSuffix,
  isDark,
}: TooltipContentProps<number, string> & {
  formatSpec?: FormatSpec;
  valuePrefix?: string;
  valueSuffix?: string;
  isDark: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  const value = typeof p.value === "number" ? p.value : Number(p.value);
  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 text-xs font-mono tabular-nums shadow-soft-card border",
        isDark
          ? "bg-ink text-ink-inverse border-ink/40"
          : "bg-surface text-ink border-line-soft",
      )}
    >
      <div className="font-medium">
        {formatValueFromSpec(value, formatSpec, {
          prefix: valuePrefix,
          suffix: valueSuffix,
        })}
      </div>
      {label && <div className="opacity-70 mt-0.5">{label}</div>}
    </div>
  );
}

export function AreaChartCard({
  title,
  period,
  data,
  tone = "emerald",
  pinnedTooltip,
  accessory,
  chartHeight = 200,
  formatSpec,
  valuePrefix,
  valueSuffix,
  className,
}: AreaChartCardProps) {
  const isDark = tone === "ink";
  const stroke = TONE_STROKE[tone];
  const gradientId = `area-grad-${React.useId().replace(/:/g, "")}`;

  // Locate the peak so we can position the pinned-tooltip capsule.
  const peakIndex = React.useMemo(() => {
    if (!data.length) return -1;
    let best = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i].value > data[best].value) best = i;
    }
    return best;
  }, [data]);
  const peakPctX =
    data.length > 1 && peakIndex >= 0
      ? (peakIndex / (data.length - 1)) * 100
      : 50;

  return (
    <div
      className={cn(
        "rounded-3xl border border-line-soft shadow-soft-card p-6 md:p-7 flex flex-col gap-5",
        TONE_BG[tone],
        className,
      )}
      data-stage10="area-chart-card"
      data-tone={tone}
    >
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          {period && (
            <span
              className={cn(
                "text-[11px] uppercase tracking-[0.16em] font-medium",
                isDark ? "text-ink-inverse opacity-70" : "text-ink-tertiary",
              )}
            >
              {period}
            </span>
          )}
          <h3
            className={cn(
              "text-display text-[22px] md:text-[26px] leading-tight font-medium",
              isDark ? "text-ink-inverse" : "text-ink",
            )}
          >
            {title}
          </h3>
        </div>
        {accessory && <div className="shrink-0">{accessory}</div>}
      </header>

      {data.length < 2 ? (
        <div
          className={cn(
            "flex items-center justify-center text-sm",
            isDark ? "text-ink-inverse opacity-60" : "text-ink-tertiary",
          )}
          style={{ height: chartHeight }}
        >
          Not enough data to render a trend yet.
        </div>
      ) : (
        <div className="relative" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: 11,
                  fill: isDark
                    ? "rgba(244,241,235,0.6)"
                    : "var(--ink-tertiary)",
                }}
                interval="preserveStartEnd"
                minTickGap={32}
              />
              <YAxis hide />
              <Tooltip
                cursor={{
                  stroke: isDark
                    ? "rgba(244,241,235,0.3)"
                    : "var(--line-strong)",
                  strokeDasharray: "3 3",
                }}
                content={(props) => (
                  <DefaultTooltip
                    {...(props as TooltipContentProps<number, string>)}
                    formatSpec={formatSpec}
                    valuePrefix={valuePrefix}
                    valueSuffix={valueSuffix}
                    isDark={isDark}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                fillOpacity={1}
                isAnimationActive={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: stroke }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {pinnedTooltip && peakIndex >= 0 && (
            <div
              className="pointer-events-none absolute top-1 -translate-x-1/2"
              style={{ left: `${peakPctX}%` }}
            >
              <div className="rounded-full bg-ink text-ink-inverse text-xs font-mono tabular-nums px-3 py-1.5 shadow-soft-card flex flex-col items-center gap-0.5 whitespace-nowrap">
                <span className="font-medium">{pinnedTooltip.value}</span>
                {pinnedTooltip.label && (
                  <span className="opacity-70 text-[10px]">
                    {pinnedTooltip.label}
                  </span>
                )}
              </div>
              <div className="w-px h-3 bg-ink/60 mx-auto" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
