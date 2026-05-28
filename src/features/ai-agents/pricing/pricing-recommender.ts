/**
 * Phase 2.4 mgmt-02 — pricing-recommender agent (stub).
 *
 * Daily scan that suggests rule edits — e.g. "Comp set dropped 8%
 * over the last 14d; consider lowering Sat ceiling". Drives the
 * highlighted card on /pricing/comp.
 */

export interface PricingRecommenderInput {
  organizationId: string;
}

export interface PricingRecommendation {
  villaId: string;
  kind: "raise-floor" | "lower-ceiling" | "add-event" | "tighten-occupancy";
  rationale: string;
  /** 0..1 */
  confidence: number;
  /** Suggested rule patch ready for one-click apply. */
  suggestedRule?: unknown;
}

export interface PricingRecommenderOutput {
  recommendations: PricingRecommendation[];
}

export async function recommend(_input: PricingRecommenderInput): Promise<PricingRecommenderOutput> {
  return { recommendations: [] };
}

export const PRICING_RECOMMENDER_AGENT = {
  agentCode: "pricing-recommender",
  cron: "30 4 * * *",
  description: "Daily 04:30 scan; suggests rule edits based on comp-set + occupancy drift.",
} as const;
