/**
 * FC-GUEST-STAY-PORTAL / FC-MANAGEMENT-FRONT-OFFICE — check-in state machine.
 *
 * Canonical states stored on `checkins.status`:
 *   not_started → in_progress → submitted → approved → code_issued
 *
 * - The guest moves not_started/in_progress → submitted (online check-in).
 * - The operator (Front office) moves submitted → approved → code_issued; the
 *   approval issues the door code that the guest then sees.
 *
 * Only these edges are legal; everything else is rejected server-side via
 * {@link assertTransition} (MASTER §6), not merely hidden in the UI.
 */

export type CheckinStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "approved"
  | "code_issued";

export const CHECKIN_TRANSITIONS: Record<CheckinStatus, readonly CheckinStatus[]> = {
  not_started: ["in_progress", "submitted"],
  in_progress: ["submitted"],
  submitted: ["approved"],
  approved: ["code_issued"],
  code_issued: [],
};

export function canTransition(from: CheckinStatus, to: CheckinStatus): boolean {
  return CHECKIN_TRANSITIONS[from]?.includes(to) ?? false;
}

export class IllegalCheckinTransition extends Error {
  constructor(
    public readonly from: CheckinStatus,
    public readonly to: CheckinStatus,
  ) {
    super(`Illegal checkin.status transition: ${from} → ${to}`);
    this.name = "IllegalCheckinTransition";
  }
}

export function assertTransition(from: CheckinStatus, to: CheckinStatus): void {
  if (!canTransition(from, to)) throw new IllegalCheckinTransition(from, to);
}

/** Guest may submit from not_started or in_progress. */
export function canSubmit(status: CheckinStatus): boolean {
  return canTransition(status, "submitted");
}

/** Operator approves a submitted check-in (then the code is issued). */
export function canApprove(status: CheckinStatus): boolean {
  return status === "submitted";
}

/** The door code is only revealed once the operator has issued it. */
export function isCodeIssued(status: CheckinStatus): boolean {
  return status === "code_issued";
}

/** Awaiting operator review on the Front office board. */
export function isAwaitingReview(status: CheckinStatus): boolean {
  return status === "submitted";
}
