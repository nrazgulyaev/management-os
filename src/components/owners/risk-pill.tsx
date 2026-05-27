import * as React from "react";

/**
 * Phase 2.2 mgmt-03 — RiskPill.
 *
 * 3 states matching the retention-risk signals output:
 *   ok     → no concerns
 *   watch  → soft signal — 30-day window
 *   flag   → hard signal — surface insight + email Director
 */

export type RiskLevel = "ok" | "watch" | "flag";

const LABEL: Record<RiskLevel, string> = { ok: "OK", watch: "Watch", flag: "Flag" };

export interface RiskPillProps {
  level: RiskLevel;
  /** Hover-only explainer. */
  reason?: string;
  className?: string;
}

export function RiskPill({ level, reason, className }: RiskPillProps) {
  return (
    <span
      className={`risk-pill ${level}${className ? ` ${className}` : ""}`}
      title={reason}
    >
      <span className="dot" aria-hidden />
      {LABEL[level]}
      {reason && <span className="reason">· {reason}</span>}
    </span>
  );
}
