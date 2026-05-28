/**
 * Phase 2.4 mgmt-04 — concierge-agent (stub).
 *
 * Pattern-matches inbound guest messages. Two paths:
 *   routine → autonomous reply (e.g. wifi password, restaurant
 *             rec, towels) + optional auto-action (dispatch a
 *             housekeeping request)
 *   issue   → no reply; escalates to staff inbox with an URGENT
 *             tag + the recovery-monitor 30min timer
 *
 * Agent attribution is visible to staff (terra-tint, "agent" tag)
 * but stripped from the guest-facing copy — Critical UX rule 1.
 */

export interface ConciergeAgentInput {
  organizationId: string;
  threadId: string;
  messageBody: string;
  bookingId: string;
}

export interface ConciergeAgentAction {
  kind: "booked" | "dispatched" | "answered" | "scheduled";
  label: string;
  refId?: string;
}

export interface ConciergeAgentOutput {
  route: "routine" | "issue";
  confidence: number;
  /** Reply body — only set when route=routine. */
  reply?: string;
  /** Optional side-effect action the runtime should fan out. */
  action?: ConciergeAgentAction;
  /** When route=issue, the agent suggests a priority for the human ticket. */
  suggestedPriority?: "urgent" | "high" | "normal";
}

export async function route(_input: ConciergeAgentInput): Promise<ConciergeAgentOutput> {
  return { route: "issue", confidence: 0, suggestedPriority: "normal" };
}

export const CONCIERGE_AGENT = {
  agentCode: "concierge-agent",
  description: "Routes inbound guest messages: routine → autonomous reply, issue → staff escalation.",
} as const;
