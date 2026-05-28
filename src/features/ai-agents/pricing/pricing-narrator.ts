/**
 * Phase 2.4 mgmt-02 — pricing-narrator agent (stub).
 *
 * Generates the natural-language explainer for a rate cell: "Why
 * is the price 4.2M IDR on Saturday?" → reads the engine audit
 * trail + active rules + recent comp deltas and emits a 2-3
 * sentence narration. Used in the PricingCurve tooltip + the
 * cell drawer on /pricing.
 */

export interface PricingNarratorInput {
  organizationId: string;
  villaId: string;
  date: string;
}

export interface PricingNarratorOutput {
  narration: string;
  citations: { kind: "rule" | "event" | "comp"; id: string; label: string }[];
}

export async function explain(_input: PricingNarratorInput): Promise<PricingNarratorOutput> {
  return { narration: "", citations: [] };
}

export const PRICING_NARRATOR_AGENT = {
  agentCode: "pricing-narrator",
  description: "Generates the 2-3 sentence rate-cell explainer for curve tooltips.",
} as const;
