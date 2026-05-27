import * as React from "react";
import type { DeltaTone } from "@/features/boq/variance";

/**
 * Phase 2.2 dev-03 — DeltaPill.
 *
 * Inline pct delta badge. Renders the signed % vs the planned
 * value, tinted by tone:
 *   - ok      |Δ| ≤ 5%
 *   - warn    |Δ| ≤ 15%
 *   - danger  |Δ| > 15%
 *   - neutral no actuals yet
 */

export interface DeltaPillProps {
  /** Current/actual value. */
  value: number;
  /** Baseline/planned value. */
  baseline: number;
  /** Pre-computed tone. Computed from %|Δ| when omitted. */
  tone?: DeltaTone;
  /** Render as a one-liner (kind: "cost"|"qty"|"rate"). */
  kind?: "cost" | "qty" | "rate";
  className?: string;
}

function classify(pct: number): DeltaTone {
  const abs = Math.abs(pct);
  if (abs <= 5) return "ok";
  if (abs <= 15) return "warn";
  return "danger";
}

export function DeltaPill({ value, baseline, tone, kind, className }: DeltaPillProps) {
  if (baseline === 0) {
    return <span className={`delta-pill neutral${className ? ` ${className}` : ""}`}>—</span>;
  }
  const pct = ((value - baseline) / baseline) * 100;
  const t = tone ?? classify(pct);
  const sign = pct > 0 ? "+" : "";
  return (
    <span className={`delta-pill ${t}${className ? ` ${className}` : ""}`} data-kind={kind}>
      {sign}{pct.toFixed(1)}%
    </span>
  );
}
