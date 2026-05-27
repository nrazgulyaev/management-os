import * as React from "react";

/**
 * Phase 2.3 owner-03 — OccupancyBars.
 *
 * 6-bar chart (one bar per month, trailing 6 months). Terra fill
 * per spec. No external charting dep.
 */

export interface OccupancyBar {
  /** "Jan", "Feb", … */
  label: string;
  /** 0..100. */
  pct: number;
}

export interface OccupancyBarsProps {
  bars: OccupancyBar[];
  className?: string;
}

export function OccupancyBars({ bars, className }: OccupancyBarsProps) {
  if (bars.length === 0) {
    return (
      <div className={`occupancy-bars empty${className ? ` ${className}` : ""}`}>
        No occupancy data yet.
      </div>
    );
  }
  return (
    <div className={`occupancy-bars${className ? ` ${className}` : ""}`}>
      {bars.map((b, i) => {
        const pct = Math.max(0, Math.min(100, b.pct));
        return (
          <div className="ob-col" key={i}>
            <div className="ob-track">
              <div className="ob-fill" style={{ height: `${pct}%` }} />
            </div>
            <div className="ob-label mono">{b.label}</div>
            <div className="ob-pct mono">{Math.round(pct)}%</div>
          </div>
        );
      })}
    </div>
  );
}
