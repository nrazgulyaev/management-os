import * as React from "react";

/**
 * Phase 2.2 dev-01 — NumKpi.
 *
 * Inline number + label combo. Smaller, denser than the dashboard
 * `<Kpi>` primitive — designed for sidebar mini-stats and detail-
 * page meta strips ("142 milestones · 18 open RFIs · 6 risks").
 */

export interface NumKpiProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Optional sub line (e.g. "+3 this week"). */
  sub?: React.ReactNode;
  /** Tone tints the value (default = ink). */
  tone?: "ink" | "accent" | "ok" | "warn" | "danger";
  className?: string;
}

const TONE_CLASS: Record<NonNullable<NumKpiProps["tone"]>, string> = {
  ink: "",
  accent: "tone-accent",
  ok: "tone-ok",
  warn: "tone-warn",
  danger: "tone-danger",
};

export function NumKpi({ label, value, sub, tone = "ink", className }: NumKpiProps) {
  return (
    <div className={`num-kpi ${TONE_CLASS[tone]}${className ? ` ${className}` : ""}`}>
      <span className="value">{value}</span>
      <span className="label">{label}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}
