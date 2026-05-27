/**
 * Phase 2.2 dev-02 — capital-call-drafter agent (stub).
 *
 * Event-triggered when `cashflow-forecaster` flags a project cash
 * runway under 14 days. Drafts a capital call with pro-rata
 * allocations against active commitments + an issue date 7 days
 * out, parked in `capital_calls.status = "drafting"` for CFO
 * review.
 */

export interface CapitalCallDrafterInput {
  organizationId: string;
  projectId: string;
  /** Cash runway in days at trigger time. */
  runwayDays: number;
}

export interface CapitalCallDrafterOutput {
  draftCallId: string | null;
  totalUsdMinor: bigint;
  /** Allocation rows, pre-filled pro-rata. */
  allocations: { investorId: string; pct: number; usdMinor: bigint }[];
}

export async function run(_input: CapitalCallDrafterInput): Promise<CapitalCallDrafterOutput> {
  return { draftCallId: null, totalUsdMinor: 0n, allocations: [] };
}

export const CAPITAL_CALL_DRAFTER_AGENT = {
  agentCode: "capital-call-drafter",
  description: "Drafts a pro-rata capital call when project cash runway dips under 14 days.",
} as const;
