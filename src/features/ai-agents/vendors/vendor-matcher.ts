/**
 * Phase 2.2 dev-04 — vendor-matcher agent (stub).
 *
 * Two-mode agent:
 *   1. RFQ-create     → suggests a shortlist of vendors based on
 *                       category + score + recent performance.
 *   2. award-time     → ranks the quotes already collected and
 *                       emits the recommendation banner.
 */

export interface VendorMatcherSuggestInput {
  organizationId: string;
  category: string;
  /** Optional project context for region/route-affinity bonuses. */
  projectId?: string;
}

export interface VendorMatcherSuggestOutput {
  vendorIds: string[];
  rationale: string;
}

export interface VendorMatcherRankInput {
  organizationId: string;
  rfqId: string;
}

export interface VendorMatcherRankOutput {
  winnerVendorId: string | null;
  rationale: string;
  /** 0..100. */
  confidence: number;
  /** USD saving vs runner-up, may be 0. */
  savingsUsd: number;
}

export async function suggestForRfq(_input: VendorMatcherSuggestInput): Promise<VendorMatcherSuggestOutput> {
  return { vendorIds: [], rationale: "Stub — wires up in 2.2 data." };
}

export async function rankAtAward(_input: VendorMatcherRankInput): Promise<VendorMatcherRankOutput> {
  return { winnerVendorId: null, rationale: "Stub", confidence: 0, savingsUsd: 0 };
}

export const VENDOR_MATCHER_AGENT = {
  agentCode: "vendor-matcher",
  description: "Suggests vendors at RFQ-create + ranks quotes at award time.",
} as const;
