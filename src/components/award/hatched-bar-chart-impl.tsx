/**
 * Sprint 4 — HatchedBarChart recharts implementation.
 *
 * Split out of `hatched-bar-chart.tsx` so recharts loads lazily (the
 * public `HatchedBarChart` is a `next/dynamic({ ssr:false })` wrapper
 * around this module). Behaviour is identical to the original.
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
import type {
  HatchedBarChartProps,
  HatchedBarDatum,
  HatchedBarTone,
} from "./hatched-bar-chart-shared";

const TONE_VAR: Record<HatchedBarTone, string> = {
  emerald: "var(--data-emerald)",
  gold: "var(--data-gold)",
  sage: "var(--data-sage)",
  terracotta: "var(--data-terracotta)",
};

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

export function HatchedBarChartImpl({
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
