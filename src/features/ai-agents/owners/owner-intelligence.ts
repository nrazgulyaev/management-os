/**
 * Phase 2.2 mgmt-03 — owner-intelligence agent (stub).
 *
 * Daily 05:00 + on-demand. Walks each owner's retention signals,
 * runs `computeRetentionRisk`, and upserts `owner_insights` rows
 * for any new flag/watch state. Dismissals (with reasons) train
 * the model.
 */

export interface OwnerIntelligenceInput {
  organizationId: string;
  ownerId?: string;
}

export interface OwnerIntelligenceOutput {
  insightsCreated: number;
  insightsSuppressed: number;
}

export async function run(_input: OwnerIntelligenceInput): Promise<OwnerIntelligenceOutput> {
  return { insightsCreated: 0, insightsSuppressed: 0 };
}

export const OWNER_INTELLIGENCE_AGENT = {
  agentCode: "owner-intelligence",
  cron: "0 5 * * *",
  description: "Daily retention-risk scan; writes owner_insights with worse-of composite.",
} as const;
