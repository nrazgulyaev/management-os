/**
 * Phase 2.4 dev-02 — lead-scorer agent (stub).
 *
 * Daily score 0..100 per lead based on interactions cadence, tour
 * attendance, funding match, unit-fit, and time-decay. Drives the
 * "hot" boolean on the kanban + the default sort on /sales/inbound.
 */

export interface LeadScorerInput {
  organizationId: string;
  leadId?: string;
}

export interface LeadScorerOutput {
  scoresUpdated: number;
  hotPromotions: number;
}

export async function run(_input: LeadScorerInput): Promise<LeadScorerOutput> {
  return { scoresUpdated: 0, hotPromotions: 0 };
}

export const LEAD_SCORER_AGENT = {
  agentCode: "lead-scorer",
  cron: "0 4 * * *",
  description: "Daily 04:00 lead score refresh; flips the 'hot' boolean on threshold.",
} as const;
