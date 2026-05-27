import * as React from "react";

/**
 * Phase 2.2 dev-02 — Waterfall chart.
 *
 * Static row-based bar visualization. Each row carries a label, a
 * percentage width (0..100 against the largest row), and a tone:
 *
 *   accent  → capital in (commitments → called)
 *   ink     → outflows (5 capex categories)
 *   dashed  → reserved (still on books, not deployed)
 *   ok      → net / cash on hand
 *
 * Not a real chart; just CSS bars. Good enough for cabinet-level
 * readability without pulling a charting dep.
 */

export type WaterfallRowTone = "accent" | "ink" | "dashed" | "ok";

export interface WaterfallRow {
  label: string;
  /** USD minor (cents). Used for both display + width calc. */
  usdMinor: bigint | number;
  tone: WaterfallRowTone;
  /** Optional secondary label rendered after the value. */
  hint?: React.ReactNode;
}

export interface WaterfallChartProps {
  rows: WaterfallRow[];
  /** Currency display (USD by default). */
  currency?: string;
  className?: string;
}

function toUsd(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) / 100 : value / 100;
}

function fmtUsd(value: bigint | number, currency = "USD"): string {
  const major = toUsd(value);
  const abs = Math.abs(major);
  let display = "";
  if (abs >= 1_000_000) display = `${(major / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) display = `${(major / 1_000).toFixed(0)}K`;
  else display = `${Math.round(major)}`;
  return `${currency} ${display}`;
}

export function WaterfallChart({ rows, currency = "USD", className }: WaterfallChartProps) {
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(toUsd(r.usdMinor))), 0);
  return (
    <div className={`waterfall${className ? ` ${className}` : ""}`}>
      {rows.map((r, i) => {
        const major = toUsd(r.usdMinor);
        const pct = max > 0 ? (Math.abs(major) / max) * 100 : 0;
        return (
          <div className={`wf-row tone-${r.tone}`} key={`${r.label}-${i}`}>
            <span className="wf-label">{r.label}</span>
            <div className="wf-track">
              <div className="wf-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="wf-value mono">
              {fmtUsd(r.usdMinor, currency)}
              {r.hint && <span className="wf-hint">{r.hint}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
