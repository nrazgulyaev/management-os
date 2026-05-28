"use client";

/**
 * Phase 2.4 dev-02 — FunnelChart.
 *
 * Pure-SVG funnel for /sales/forecast. Each stage is a trapezoid
 * normalized against the largest stage. Hover/click emits the
 * stage key.
 */

import * as React from "react";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Optional sublabel ("12 hot · 3 stuck"). */
  sub?: string;
}

export interface FunnelChartProps {
  stages: FunnelStage[];
  height?: number;
  onStageClick?: (key: string) => void;
  className?: string;
}

export function FunnelChart({ stages, height = 280, onStageClick, className }: FunnelChartProps) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  const stepW = 100 / stages.length;
  const heights = stages.map((s) => Math.max(8, (s.count / max) * 100));

  return (
    <div className={`funnel-chart${className ? ` ${className}` : ""}`} style={{ height }}>
      <svg viewBox={`0 0 100 100`} preserveAspectRatio="none" className="fc-svg">
        {stages.map((s, i) => {
          const h = heights[i];
          const next = heights[i + 1] ?? h * 0.6;
          const x = i * stepW;
          const top1 = (100 - h) / 2;
          const top2 = (100 - next) / 2;
          const bot1 = 100 - top1;
          const bot2 = 100 - top2;
          const d = `M ${x} ${top1} L ${x + stepW} ${top2} L ${x + stepW} ${bot2} L ${x} ${bot1} Z`;
          return (
            <path
              key={s.key}
              d={d}
              className="fc-stage"
              opacity={0.18 + (h / 100) * 0.6}
              onClick={() => onStageClick?.(s.key)}
            />
          );
        })}
      </svg>
      <div className="fc-legend">
        {stages.map((s) => (
          <div key={s.key} className="fc-row" onClick={() => onStageClick?.(s.key)}>
            <span className="fc-label">{s.label}</span>
            <span className="fc-count mono">{s.count}</span>
            {s.sub && <span className="fc-sub mono">{s.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
