/**
 * Phase 2.3 owner-05 — owner-concierge agent (stub).
 *
 * Inbox auto-responder. On every new owner message, the concierge
 * tries to answer common questions (statement explainer, payout
 * timing, villa policy) with cited links. Routes to a human when:
 *   - confidence < 0.80
 *   - topic is sensitive (dispute, contract, complaint)
 *   - owner has explicitly asked for a human earlier in the thread
 */

export type ConciergeRoute = "auto-reply" | "human";

export interface OwnerConciergeInput {
  organizationId: string;
  ownerId: string;
  threadId: string;
  messageBody: string;
  /** kind helps the router suppress auto-reply on disputes. */
  threadKind: "statement_dispute" | "personal_stay" | "q_review" | "general";
}

export interface OwnerConciergeOutput {
  route: ConciergeRoute;
  confidence: number;
  draftBody?: string;
  inlineActions?: { label: string; href: string }[];
  routedToUserId?: string | null;
}

export async function route(input: OwnerConciergeInput): Promise<OwnerConciergeOutput> {
  // Sensitive kinds always go to human.
  if (input.threadKind === "statement_dispute") {
    return { route: "human", confidence: 0.0, routedToUserId: null };
  }
  return { route: "human", confidence: 0.0, routedToUserId: null };
}

export const OWNER_CONCIERGE_AGENT = {
  agentCode: "owner-concierge",
  description:
    "Inbox auto-responder for owner questions; cites statement / payout / villa-policy docs and routes to a human below 0.80 confidence.",
} as const;
