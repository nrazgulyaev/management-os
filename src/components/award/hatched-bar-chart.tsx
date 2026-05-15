/**
 * Sprint 4 — HatchedBarChart primitive.
 *
 * Reference 2 "Project Analytics" pattern: vertical bars where some
 * are solid filled (active days) and others are diagonal-hatched
 * (inactive / historical). Built on Recharts with a custom `shape`
 * renderer so each datum picks its own fill style.
 *
 * Optional `highlightIndex` adds a small "74%" callout above one bar.
 */

"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import { cn } from "@/lib/utils";
import { formatValueFromSpec, type FormatSpec } from "./format-specs";

export type HatchedBarTone = "emerald" | "gold" | "sage" | "terracotta";

const TONE_VAR: Record<HatchedBarTone, string> = {
  emerald: "var(--data-emerald)",
  gold: "var(--data-gold)",
  sage: "var(--data-sage)",
  terracotta: "var(--data-terracotta)",
};

export interface HatchedBarDatum {
  label: string;
  value: number;
  /**
   * Render style for this bar:
   *   "active"   → solid tone fill (default)
   *   "inactive" → hatched fill (track-only look)
   */
  status?: "active" | "inactive";
  /** Optional caption shown above the bar (e.g. "74%"). */
  caption?: string;
}

export interface HatchedBarChartProps {
  data: HatchedBarDatum[];
  tone?: HatchedBarTone;
  /**
   * If set, the bar at this index renders a small callout chip above
   * it (e.g. "74%"). Overrides per-datum `caption` for convenience.
   */
  highlightIndex?: number;
  /** Pixel height for the chart area. Defaults to 220. */
  height?: number;
  /**
   * Tooltip value formatting. Serialisable across the RSC boundary
   * so server-component consumers can pass it safely. Pair with
   * `valuePrefix` / `valueSuffix` for non-Intl currency labels.
   */
  formatSpec?: FormatSpec;
  valuePrefix?: string;
  valueSuffix?: string;
  className?: string;
}

interface CustomBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: HatchedBarDatum;
  solidFill: string;
  hatchId: string;
  index?: number;
  highlightIndex?: number;
  highlightLabel?: string;
}

function CustomBar(props: CustomBarProps) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    payload,
    solidFill,
    hatchId,
    index,
    highlightIndex,
    highlightLabel,
  } = props;
  const isHighlight = index !== undefined && index === highlightIndex;
  const isInactive = payload?.status === "inactive";
  const fill = isInactive ? `url(#${hatchId})` : solidFill;

  // Bars use Recharts' bottom-anchored rectangles. We render a rounded
  // pill-shaped bar by drawing an oversized rx; the path naturally
  // clips to the bar's allocated box.
  const radius = Math.min(width / 2, 24);

  return (
    <g data-bar-status={payload?.status ?? "active"}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius}
        ry={radius}
        fill={fill}
        stroke={isInactive ? "var(--line-soft)" : "none"}
      />
      {isHighlight && (highlightLabel || payload?.caption) && (
        <g>
          <rect
            x={x + width / 2 - 22}
            y={y - 26}
            width={44}
            height={20}
            rx={10}
            ry={10}
            fill="var(--surface)"
            stroke="var(--line-soft)"
          />
          <text
            x={x + width / 2}
            y={y - 11}
            textAnchor="middle"
            fontSize={11}
            fill="var(--ink)"
            fontFamily="var(--font-mono)"
          >
            {highlightLabel ?? payload?.caption}
          </text>
        </g>
      )}
    </g>
  );
}

function HatchedTooltip({
  active,
  payload,
  formatSpec,
  valuePrefix,
  valueSuffix,
}: TooltipContentProps<number, string> & {
  formatSpec?: FormatSpec;
  valuePrefix?: string;
  valueSuffix?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  const value = typeof p.value === "number" ? p.value : Number(p.value);
  const datum = p.payload as HatchedBarDatum;
  return (
    <div className="rounded-md bg-surface border border-line-soft px-3 py-2 shadow-soft-card text-xs">
      <div className="font-medium text-ink">{datum.label}</div>
      <div className="font-mono tabular-nums text-ink-secondary mt-0.5">
        {formatValueFromSpec(value, formatSpec, {
          prefix: valuePrefix,
          suffix: valueSuffix,
        })}
      </div>
    </div>
  );
}

export function HatchedBarChart({
  data,
  tone = "emerald",
  highlightIndex,
  height = 220,
  formatSpec,
  valuePrefix,
  valueSuffix,
  className,
}: HatchedBarChartProps) {
  const solidFill = TONE_VAR[tone];
  // Stable hatch-pattern id per render so multiple charts on a page
  // don't collide.
  const hatchId = `hatch-${React.useId().replace(/:/g, "")}`;

  const highlightLabel =
    highlightIndex !== undefined &&
    highlightIndex >= 0 &&
    highlightIndex < data.length
      ? data[highlightIndex].caption ?? `${data[highlightIndex].value}`
      : undefined;

  return (
    <div
      className={cn("w-full", className)}
      style={{ height }}
      data-stage10="hatched-bar-chart"
      data-tone={tone}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 32, right: 12, bottom: 8, left: 0 }}
          barCategoryGap="22%"
        >
          <defs>
            <pattern
              id={hatchId}
              patternUnits="userSpaceOnUse"
              width={6}
              height={6}
              patternTransform="rotate(135)"
            >
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={6}
                stroke="var(--line-strong)"
                strokeWidth={1.2}
                strokeOpacity={0.55}
              />
            </pattern>
          </defs>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{
              fontSize: 11,
              fill: "var(--ink-tertiary)",
            }}
            interval={0}
          />
          <YAxis hide />
          <Tooltip
            cursor={false}
            content={(p) => (
              <HatchedTooltip
                {...(p as TooltipContentProps<number, string>)}
                formatSpec={formatSpec}
                valuePrefix={valuePrefix}
                valueSuffix={valueSuffix}
              />
            )}
          />
          <Bar
            dataKey="value"
            isAnimationActive={false}
            shape={(rawProps: unknown) => {
              const p = rawProps as CustomBarProps;
              return (
                <CustomBar
                  {...p}
                  solidFill={solidFill}
                  hatchId={hatchId}
                  highlightIndex={highlightIndex}
                  highlightLabel={highlightLabel}
                />
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
