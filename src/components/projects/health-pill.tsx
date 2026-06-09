import * as React from "react";

/**
 * Phase 2.2 dev-01 — HealthPill.
 *
 * Compact tri-state health badge used on project cards + detail
 * headers. Levels:
 *
 *   green  → ≤7d slip / on budget
 *   amber  → 7–21d slip / 5–10% over budget
 *   red    → >21d slip / >10% over budget
 *
 * `reason` renders as a hover-only tooltip; the pill itself stays
 * one-glyph wide so the card grid layout never reflows.
 */

export type HealthLevel = "green" | "amber" | "red";

export interface HealthPillProps {
  level: HealthLevel;
  /** Optional explanation surfaced on hover (title attr). */
  reason?: string;
  /** Default false — shorter dot-only form. Pass true to render
   *  "On track" / "Amber · BOQ alert" etc. */
  verbose?: boolean;
  /** Overrides the default verbose label (e.g. "Amber · BOQ alert"). */
  verboseLabel?: React.ReactNode;
  className?: string;
}

const LABEL: Record<HealthLevel, string> = {
  green: "On track",
  amber: "At risk",
  red: "Critical",
};

export function HealthPill({ level, reason, verbose, verboseLabel, className }: HealthPillProps) {
  return (
    <span
      className={`health-pill ${level}${verbose ? " verbose" : ""}${className ? ` ${className}` : ""}`}
      title={reason}
      data-health={level}
    >
      <span className="dot" aria-hidden />
      {verbose && <span className="lbl">{verboseLabel ?? LABEL[level]}</span>}
    </span>
  );
}
