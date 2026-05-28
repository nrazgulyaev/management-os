/**
 * Phase 2.4 dev-02 — Offer policy.
 *
 * Critical UX rule 2: offers below list require manager approval.
 * Pure fn used by OfferModal + offer-drafter agent so a single
 * threshold lives in code.
 */

export interface OfferPolicyInput {
  amountIdr: number;
  listPriceIdr: number;
  /** Tier discount staff are allowed to grant inline (0..1). Default 5%. */
  inlineDiscountTolerance?: number;
}

export type OfferPolicyOutcome =
  | { allowed: true; autoApproved: true }
  | { allowed: true; autoApproved: false; requiresApprovalBy: "manager" | "director" }
  | { allowed: false; reason: string };

export function checkOfferPolicy(input: OfferPolicyInput): OfferPolicyOutcome {
  if (input.amountIdr <= 0) return { allowed: false, reason: "Offer must be positive." };
  if (input.listPriceIdr <= 0) return { allowed: false, reason: "List price missing." };
  if (input.amountIdr > input.listPriceIdr) return { allowed: true, autoApproved: true };

  const tolerance = input.inlineDiscountTolerance ?? 0.05;
  const discount = 1 - input.amountIdr / input.listPriceIdr;
  if (discount <= tolerance) return { allowed: true, autoApproved: true };
  if (discount <= 0.15) return { allowed: true, autoApproved: false, requiresApprovalBy: "manager" };
  return { allowed: true, autoApproved: false, requiresApprovalBy: "director" };
}
