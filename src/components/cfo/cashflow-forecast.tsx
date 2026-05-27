"use client";

/**
 * Phase 2.2 dev-02 — Cashflow forecast.
 *
 * 12-month rolling forecast. Sparkline above + per-month table
 * below. The sparkline is inline SVG (no charting dep). Negative
 * forecast months render red; the cumulative line traces against
 * the zero axis.
 */

import * as React from "react";

export interface ForecastMonth {
  /** YYYY-MM. */
  month: string;
  /** Net cashflow in USD minor (cents). Negative for net outflow. */
  netUsdMinor: bigint | number;
  /** Cumulative cash on hand at month-end (cents). */
  cumulativeUsdMinor: bigint | number;
}

export interface CashflowForecastProps {
  months: ForecastMonth[];
  className?: string;
}

function toUsd(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) / 100 : value / 100;
}

function fmt(value: bigint | number): string {
  const usd = toUsd(value);
  const sign = usd < 0 ? "−" : "";
  const abs = Math.abs(usd);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export function CashflowForecast({ months, className }: CashflowForecastProps) {
  if (months.length === 0) {
    return (
      <div className={`cashflow-forecast empty${className ? ` ${className}` : ""}`}>
        No forecast available. Run the cashflow-forecaster agent.
      </div>
    );
  }

  const series = months.map((m) => toUsd(m.cumulativeUsdMinor));
  const max = Math.max(...series, 0);
  const min = Math.min(...series, 0);
  const span = max - min || 1;
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1 || 1)) * 100;
      const y = 100 - ((v - min) / span) * 100;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className={`cashflow-forecast${className ? ` ${className}` : ""}`}>
      <svg className="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={points} fill="none" strokeWidth="2" />
        <line x1="0" y1={100 - (-min / span) * 100} x2="100" y2={100 - (-min / span) * 100} className="axis" />
      </svg>
      <table className="data forecast-table">
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">Net</th>
            <th className="num">Cumulative</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const net = toUsd(m.netUsdMinor);
            const cum = toUsd(m.cumulativeUsdMinor);
            return (
              <tr key={m.month}>
                <td className="mono">{m.month}</td>
                <td className={`num mono ${net < 0 ? "neg" : ""}`}>{fmt(m.netUsdMinor)}</td>
                <td className={`num mono ${cum < 0 ? "neg" : ""}`}>{fmt(m.cumulativeUsdMinor)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
