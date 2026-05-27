import * as React from "react";

/**
 * Phase 2.3 owner-02 — OwnerStatusPill.
 *
 * Owner-state for a statement (separate from the operational
 * `StatementStatus` in mgmt-02). 5 states:
 *
 *   pending          gold elevated — needs the owner's attention
 *   viewed           neutral — opened but not yet acted on
 *   acknowledged     ok-green — explicitly accepted
 *   disputed         danger — opened a dispute thread
 *   auto_acknowledged neutral italic — 14d timer elapsed
 *   revised          accent — replaced by a newer revision
 */

export type OwnerStatementState =
  | "pending"
  | "viewed"
  | "acknowledged"
  | "disputed"
  | "auto_acknowledged"
  | "revised";

const LABEL: Record<OwnerStatementState, string> = {
  pending: "Pending",
  viewed: "Viewed",
  acknowledged: "Acknowledged",
  disputed: "Disputed",
  auto_acknowledged: "Auto-acked",
  revised: "Revised",
};

export interface OwnerStatusPillProps {
  state: OwnerStatementState;
  className?: string;
}

export function OwnerStatusPill({ state, className }: OwnerStatusPillProps) {
  return (
    <span className={`owner-status ${state}${className ? ` ${className}` : ""}`}>
      <span className="dot" aria-hidden />
      {LABEL[state]}
    </span>
  );
}
