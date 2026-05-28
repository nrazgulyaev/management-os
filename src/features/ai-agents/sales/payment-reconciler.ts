/**
 * Phase 2.4 dev-02 — payment-reconciler agent (stub).
 *
 * Bank webhook → matches the payload against open `payment_
 * installments`. Critical UX rule 5: this is the ONLY way an
 * installment flips to `paid`. No manual mark-paid.
 *
 * Matching strategy: amount + reference token + contract code,
 * with tolerance for fee deduction. Ambiguous matches surface in
 * the finance inbox for human review.
 */

export interface BankWebhookPayload {
  ref: string;
  amountIdr: number;
  receivedAt: string;
  /** Free-form memo from the bank. */
  memo?: string;
}

export interface PaymentReconcilerInput {
  organizationId: string;
  payload: BankWebhookPayload;
}

export interface PaymentReconcilerOutput {
  installmentId?: string;
  matched: boolean;
  confidence: number;
  /** Reasoning for matched / ambiguous. */
  rationale: string;
}

export async function reconcile(_input: PaymentReconcilerInput): Promise<PaymentReconcilerOutput> {
  return { matched: false, confidence: 0, rationale: "Stub matcher; pending bank wiring." };
}

export const PAYMENT_RECONCILER_AGENT = {
  agentCode: "payment-reconciler",
  description: "Webhook-only payment reconciliation; the only path to mark installments paid.",
} as const;
