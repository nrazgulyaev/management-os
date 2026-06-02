/**
 * Phase 2.3 owner-02 — Owner-statement state machine (FC-OWNER-STATEMENTS §1).
 *
 * Lives next to the mgmt-side state machine (`features/statements/
 * state-machine.ts`) but tracks a different dimension: how the *owner* has
 * engaged with the statement, not the operational draft → approved → sent flow.
 *
 * States (canonical — match owner_statements.owner_state):
 *   pending             statement sent, owner hasn't opened it yet
 *   viewed              owner opened the detail at least once
 *   acknowledged        owner explicitly clicked "Acknowledge"
 *   disputed            owner opened a dispute thread
 *   auto_acknowledged   14d elapsed without action — silent accept
 *   superseded          a revised statement replaced this row (resolve→reissue)
 *
 * NOTE: the schema/DB value is `superseded` (NOT the old `revised`). The
 * thread's own `resolved`/`closed` status is a separate dimension on
 * owner_threads — it is NOT an owner_state value.
 */

export type OwnerStatementState =
  | "pending"
  | "viewed"
  | "acknowledged"
  | "disputed"
  | "auto_acknowledged"
  | "superseded";

export const AUTO_ACK_DAYS = 14;

/**
 * Canonical transition map (FC-OWNER-STATEMENTS §1, MASTER §4). Only these
 * edges are legal; everything else is rejected server-side via
 * {@link assertTransition} — not merely hidden in the UI.
 *
 * - acknowledge may still be reached from pending (acknowledging implies you
 *   saw it); a viewer can dispute or acknowledge.
 * - dispute stays reachable after acknowledge / auto-ack so a late-discovered
 *   error can still be escalated (the dispute action itself blocks a 2nd open
 *   thread).
 * - superseded is reachable from any non-terminal state: a reissue can replace
 *   a statement regardless of how the owner left it. It is terminal.
 */
export const OWNER_STATE_TRANSITIONS: Record<OwnerStatementState, readonly OwnerStatementState[]> = {
  pending: ["viewed", "acknowledged", "disputed", "auto_acknowledged", "superseded"],
  viewed: ["acknowledged", "disputed", "auto_acknowledged", "superseded"],
  acknowledged: ["disputed", "superseded"],
  auto_acknowledged: ["disputed", "superseded"],
  disputed: ["superseded"],
  superseded: [],
};

export function canTransition(from: OwnerStatementState, to: OwnerStatementState): boolean {
  return OWNER_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Thrown when an illegal owner_state transition is attempted at the API layer. */
export class IllegalOwnerStateTransition extends Error {
  constructor(
    public readonly from: OwnerStatementState,
    public readonly to: OwnerStatementState,
  ) {
    super(`Illegal owner_state transition: ${from} → ${to}`);
    this.name = "IllegalOwnerStateTransition";
  }
}

/** Reject illegal transitions server-side (MASTER §6: not just hidden in UI). */
export function assertTransition(from: OwnerStatementState, to: OwnerStatementState): void {
  if (!canTransition(from, to)) throw new IllegalOwnerStateTransition(from, to);
}

/**
 * Read-only invariant (FC-OWNER-STATEMENTS Core rule + §5): the owner can
 * NEVER write a numeric/source field. Owner-initiated updates to
 * owner_statements may only touch these columns; anything else (esp. the
 * `*Minor` money fields, `status`, `contentHash`, `supersededById`) is
 * Mgmt-only. Reasserted at the API layer so a crafted request can't mutate a
 * number even if it reaches the action.
 */
export const OWNER_WRITABLE_STATEMENT_COLUMNS = [
  "ownerState",
  "ownerViewedAt",
  "ownerAckedAt",
  "ownerDisputedAt",
  "disputeReasonKind",
  "disputeThreadId",
  "updatedAt",
] as const;

export class OwnerWriteInvariantError extends Error {
  constructor(public readonly columns: string[]) {
    super(`Owner may not write statement columns: ${columns.join(", ")}`);
    this.name = "OwnerWriteInvariantError";
  }
}

/** Assert an owner-initiated owner_statements update touches only owner-writable columns. */
export function assertOwnerWritable(patch: Record<string, unknown>): void {
  const writable = new Set<string>(OWNER_WRITABLE_STATEMENT_COLUMNS);
  const illegal = Object.keys(patch).filter((k) => !writable.has(k));
  if (illegal.length) throw new OwnerWriteInvariantError(illegal);
}

export interface OwnerStateTransitionInput {
  current: OwnerStatementState;
  /** Statement's `sentAt` ISO date (when the timer started). */
  sentAt: string;
  /** Override "now" for testing / time-travel. */
  now?: Date;
}

/** Returns the next state when the timer-based auto-ack fires. */
export function applyAutoAck(input: OwnerStateTransitionInput): OwnerStatementState {
  if (input.current !== "pending" && input.current !== "viewed") return input.current;
  const now = input.now ?? new Date();
  const sent = new Date(input.sentAt);
  const days = (now.getTime() - sent.getTime()) / 86_400_000;
  if (days < AUTO_ACK_DAYS) return input.current;
  return "auto_acknowledged";
}

export function canAcknowledge(state: OwnerStatementState): boolean {
  return canTransition(state, "acknowledged");
}

export function canDispute(state: OwnerStatementState): boolean {
  // Dispute window stays open even after acknowledge — owner can still
  // escalate if they discover an issue later — but not once superseded or
  // already disputed.
  return canTransition(state, "disputed");
}

export function isPending(state: OwnerStatementState): boolean {
  return state === "pending" || state === "viewed";
}

/**
 * Mgmt-perspective label for the owner_state column on the Finance statements
 * list (FC-OWNER-STATEMENTS §4.2). pending/viewed collapse to the derived
 * "Awaiting" label the contract specifies.
 */
export function ownerStateMgmtLabel(state: OwnerStatementState): string {
  switch (state) {
    case "pending":
    case "viewed":
      return "Awaiting · owner has not acted";
    case "acknowledged":
      return "Acknowledged";
    case "auto_acknowledged":
      return "Auto-acknowledged";
    case "disputed":
      return "Disputed";
    case "superseded":
      return "Superseded";
    default:
      return state;
  }
}
