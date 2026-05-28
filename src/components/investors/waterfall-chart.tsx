"use client";

/**
 * Phase 2.4 seed — WaterfallChart.
 *
 * Pure CSS-grid waterfall — no recharts. Bars are positioned by
 * absolute cumulative + value, normalized against the max of the
 * cumulative trace. Each bar can be clicked to drill in.
 *
 * See src/styles/components/p24-primitives.css for .wf-* classes.
 */

import * as React from "react";

export type WaterfallBarKind = "start" | "add" | "sub" | "neutral" | "total";

export interface WaterfallBar {
  kind: WaterfallBarKind;
  label: string;
  sublabel?: string;
  value: number;
  /** Cumulative balance after this bar. */
  cumulative: number;
}

export interface WaterfallChartProps {
  bars: WaterfallBar[];
  unit: string;
  height?: number;
  onBarClick?: (idx: number) => void;
  className?: string;
}

export function WaterfallChart({ bars, unit, height = 280, onBarClick, className }: WaterfallChartProps) {
  const max = Math.max(...bars.map((b) => Math.max(b.cumulative, b.cumulative - b.value)), 1);
  const styleVar = { "--bars": bars.length, height } as React.CSSProperties;

  return (
    <div className={`wf-chart${className ? ` ${className}` : ""}`} style={styleVar}>
      <div className="wf-bars">
        {bars.map((b, i) => {
          const isFloat = b.kind === "add" || b.kind === "sub";
          const top = isFloat ? Math.min(b.cumulative, b.cumulative - b.value) : 0;
          const barValue = isFloat ? Math.abs(b.value) : b.cumulative;
          const hPct = (barValue / max) * 100;
          const yPct = (top / max) * 100;
          return (
            <button
              type="button"
              key={i}
              className={`wf-bar wf-${b.kind}`}
              style={{
                height: `${hPct}%`,
                marginBottom: `${yPct}%`,
              }}
              onClick={() => onBarClick?.(i)}
              aria-label={`${b.label}: ${b.value} ${unit}`}
            >
              <span className="wf-value mono">
                {b.kind === "sub" ? "−" : b.kind === "add" ? "+" : ""}
                {Math.abs(b.value)}
              </span>
              <span className="wf-label">{b.label}</span>
              {b.sublabel && <span className="wf-sublabel">{b.sublabel}</span>}
            </button>
          );
        })}
      </div>
      <div className="wf-unit mono">{unit}</div>
    </div>
  );
}
