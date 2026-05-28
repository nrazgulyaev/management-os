/**
 * Phase 2.4 dev-03 — wire-reconciler agent (stub).
 *
 * Bank webhook → matches the payload against open call_allocations
 * + distribution_allocations. Critical UX rule 4: wires are
 * webhook-only — no manual settle.
 */

export interface WireWebhookPayload {
  ref: string;
  amountIdr: number;
  receivedAt: string;
  memo?: string;
  direction: "in" | "out";
}

export interface WireReconcilerInput {
  organizationId: string;
  payload: WireWebhookPayload;
}

export interface WireReconcilerOutput {
  matched: boolean;
  allocationId?: string;
  allocationKind?: "call" | "distribution";
  confidence: number;
  rationale: string;
}

export async function reconcile(_input: WireReconcilerInput): Promise<WireReconcilerOutput> {
  return { matched: false, confidence: 0, rationale: "Stub matcher; pending bank wiring." };
}

export const WIRE_RECONCILER_AGENT = {
  agentCode: "wire-reconciler",
  description: "Webhook-only wire reconciliation for call + distribution allocations.",
} as const;
