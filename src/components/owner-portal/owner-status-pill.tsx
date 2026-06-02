import * as React from "react";
import type { OwnerStatementState } from "@/features/owner-statements/state-machine";

/**
 * Phase 2.3 owner-02 — OwnerStatusPill.
 *
 * Owner-state for a statement (separate from the operational
 * `StatementStatus` in mgmt-02). 6 states (single source of truth: the
 * owner-statements state machine):
 *
 *   pending           gold elevated — needs the owner's attention
 *   viewed            neutral — opened but not yet acted on
 *   acknowledged      ok-green — explicitly accepted
 *   disputed          danger — opened a dispute thread
 *   auto_acknowledged neutral italic — 14d timer elapsed
 *   superseded        accent — replaced by a revised statement (resolve→reissue)
 */

export type { OwnerStatementState };

const LABEL: Record<OwnerStatementState, string> = {
  pending: "Pending",
  viewed: "Viewed",
  acknowledged: "Acknowledged",
  disputed: "Disputed",
  auto_acknowledged: "Auto-acked",
  superseded: "Superseded",
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
