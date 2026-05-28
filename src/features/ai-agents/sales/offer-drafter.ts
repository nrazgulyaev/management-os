/**
 * Phase 2.4 dev-02 — offer-drafter agent (stub).
 *
 * Drafts an offer body (price, payment ladder hints, validity)
 * for a lead+unit. Drafts never auto-send — staff reviews then
 * triggers the approval gate (offer-policy.ts).
 */

export interface OfferDrafterInput {
  organizationId: string;
  leadId: string;
  unitId: string;
}

export interface OfferDrafterOutput {
  suggestedAmountIdr: number;
  suggestedValidUntil: string;
  paymentLadderHint: { stage: string; pct: number }[];
  rationale: string;
}

export async function draft(_input: OfferDrafterInput): Promise<OfferDrafterOutput> {
  return {
    suggestedAmountIdr: 0,
    suggestedValidUntil: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    paymentLadderHint: [],
    rationale: "",
  };
}

export const OFFER_DRAFTER_AGENT = {
  agentCode: "offer-drafter",
  description: "Drafts an offer (amount + ladder + validity); never auto-sends.",
} as const;
