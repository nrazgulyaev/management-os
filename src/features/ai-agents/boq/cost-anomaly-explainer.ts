/**
 * Phase 2.2 dev-03 — cost-anomaly-explainer agent (stub).
 *
 * Drafts a 1–2 sentence explanation for a flagged variance using
 * the source PO line, project schedule context, and the contractor
 * narrative (when present). Output lives next to the variance
 * review row so the QS reads a single page.
 */

export interface CostAnomalyExplainerInput {
  organizationId: string;
  varianceReviewId: string;
}

export interface CostAnomalyExplainerOutput {
  draft: string;
  confidence: number;
}

export async function run(_input: CostAnomalyExplainerInput): Promise<CostAnomalyExplainerOutput> {
  return {
    draft:
      "Stub — explanation draft fires once the agent runtime + cost-coder pipeline finish in 2.2 data.",
    confidence: 0,
  };
}

export const COST_ANOMALY_EXPLAINER_AGENT = {
  agentCode: "cost-anomaly-explainer",
  description: "Drafts variance reason text from PO + schedule context for the QS to review.",
} as const;
