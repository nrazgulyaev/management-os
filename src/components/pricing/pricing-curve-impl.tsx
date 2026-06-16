"use client";

/**
 * Phase 2.4 seed — PricingCurve recharts implementation.
 *
 * Split out of `pricing-curve.tsx` so recharts loads lazily (the public
 * `PricingCurve` is a `next/dynamic({ ssr:false })` wrapper around this
 * module). Behaviour is identical to the original.
 *
 * Recharts LineChart wrapper. Plots algo / active / lastYear /
 * compMedian series with optional event markers + draggable
 * override pins. The tooltip is a separate React node so we can
 * position it freely.
 *
 * See src/styles/components/p24-primitives.css for .pc-* classes.
 */

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type {
  PricingCurveProps,
  PricingCurveSeries,
} from "./pricing-curve-shared";

interface MergedDatum {
  ts: number;
  dateLabel: string;
  algo?: number;
  active?: number;
  lastYear?: number;
  compMedian?: number;
}

function fmt(d: Date): string {
  return d.toISOString().slice(5, 10);
}

function mergeSeries(series: PricingCurveSeries): MergedDatum[] {
  const map = new Map<number, MergedDatum>();
  const add = (k: keyof Omit<MergedDatum, "ts" | "dateLabel">, list?: { date: Date; value: number }[]) => {
    if (!list) return;
    for (const p of list) {
      const ts = p.date.getTime();
      const cur = map.get(ts) ?? { ts, dateLabel: fmt(p.date) };
      cur[k] = p.value;
      map.set(ts, cur);
    }
  };
  add("algo", series.algo);
  add("active", series.active);
  add("lastYear", series.lastYear);
  add("compMedian", series.compMedian);
  return [...map.values()].sort((a, b) => a.ts - b.ts);
}

export function PricingCurveImpl({
  series,
  events = [],
  overrides = [],
  period,
  title,
  height = 320,
  className,
}: PricingCurveProps) {
  const data = React.useMemo(() => mergeSeries(series), [series]);
  const today = Date.now();

  return (
    <div className={`pc-wrap${className ? ` ${className}` : ""}`}>
      <div className="pc-head">
        {title && <h3 className="title">{title}</h3>}
        <div className="legend">
          <span className="it"><span className="ln" style={{ ["--c" as string]: "var(--accent)" }} />Algo</span>
          <span className="it"><span className="ln" style={{ ["--c" as string]: "var(--ink)" }} />Active</span>
          {series.lastYear && (
            <span className="it"><span className="ln dash" style={{ ["--c" as string]: "var(--ink-3)" }} />Last year</span>
          )}
          {series.compMedian && (
            <span className="it"><span className="ln" style={{ ["--c" as string]: "var(--warn)" }} />Comp median</span>
          )}
        </div>
      </div>
      <div className="pc-svg-wrap">
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeOpacity={0.08} vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 10, fill: "var(--ink-3)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--ink-3)" }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "var(--ink)",
                color: "var(--inverted-fg)",
                border: 0,
                borderRadius: 8,
                fontFamily: "var(--mono-font)",
                fontSize: 11,
              }}
              labelStyle={{ color: "rgba(255,255,255,0.7)" }}
            />
            <ReferenceLine x={fmt(new Date(today))} stroke="var(--accent)" strokeDasharray="3 3" />
            {events.map((e, i) => (
              <ReferenceLine
                key={i}
                x={fmt(e.date)}
                stroke={e.severity === "high" ? "var(--warn)" : "var(--ink-3)"}
                strokeDasharray="2 4"
                label={{ value: e.label, fontSize: 9, fill: "var(--ink-3)", position: "top" }}
              />
            ))}
            {series.lastYear && (
              <Line
                type="monotone"
                dataKey="lastYear"
                stroke="var(--ink-3)"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                dot={false}
              />
            )}
            {series.compMedian && (
              <Line type="monotone" dataKey="compMedian" stroke="var(--warn)" strokeWidth={1.5} dot={false} />
            )}
            <Line type="monotone" dataKey="algo" stroke="var(--accent)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="active" stroke="var(--ink)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        {overrides.map((o, i) => (
          <div
            key={i}
            className="pc-tooltip"
            style={{ left: 0, top: -32, position: "static", display: "none" }}
            aria-hidden
          >
            {fmt(o.date)} · {o.value}
          </div>
        ))}
      </div>
      <div className="pc-controls">
        <span className={`pc-knob on`}>
          <span className="k">Period</span>
          {period}
        </span>
      </div>
    </div>
  );
}
