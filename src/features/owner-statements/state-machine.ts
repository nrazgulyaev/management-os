/**
 * Phase 2.3 owner-02 — Owner-statement state machine.
 *
 * Lives next to the mgmt-side state machine (`features/statements/
 * state-machine.ts`) but tracks a different dimension: how the
 * *owner* has engaged with the statement, not the operational
 * draft → approved → sent flow.
 *
 * States:
 *   pending             statement sent, owner hasn't opened it yet
 *   viewed              owner opened the detail at least once
 *   acknowledged        owner explicitly clicked "Acknowledge"
 *   disputed            owner opened a dispute thread
 *   auto_acknowledged   14d elapsed without action — silent accept
 *   revised             a newer revision superseded this row
 */

export type OwnerStatementState =
  | "pending"
  | "viewed"
  | "acknowledged"
  | "disputed"
  | "auto_acknowledged"
  | "revised";

export const AUTO_ACK_DAYS = 14;

export interface OwnerStateTransitionInput {
  current: OwnerStatementState;
  /** Statement's `sentAt` ISO date (when the timer started). */
  sentAt: string;
  /** Override "now" for testing. */
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
  return state === "pending" || state === "viewed";
}

export function canDispute(state: OwnerStatementState): boolean {
  // Dispute window stays open even after acknowledge — owner can
  // still escalate if they discover an issue later.
  return state !== "revised";
}

export function isPending(state: OwnerStatementState): boolean {
  return state === "pending" || state === "viewed";
}
