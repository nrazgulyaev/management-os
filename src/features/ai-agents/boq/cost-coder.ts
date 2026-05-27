/**
 * Phase 2.2 dev-03 — cost-coder agent (stub).
 *
 * Maps incoming invoice line items to BOQ codes. Reads vendor +
 * description text + amount, suggests the best-match BOQ line, and
 * surfaces a confidence score so the cost coder can accept/override.
 */

export interface CostCoderInput {
  organizationId: string;
  invoiceLine: { description: string; vendorId: string | null; amountMinor: bigint };
}

export interface CostCoderSuggestion {
  boqLineId: string | null;
  /** 0..100. */
  confidence: number;
  reason: string;
}

export async function suggest(_input: CostCoderInput): Promise<CostCoderSuggestion> {
  return { boqLineId: null, confidence: 0, reason: "Stub — agent runtime lands in 2.2 data." };
}

export const COST_CODER_AGENT = {
  agentCode: "cost-coder",
  description: "LLM-assisted invoice line → BOQ line mapping; cost-coder approves or overrides.",
} as const;
