/**
 * Phase 2.4 dev-03 — quarterly-narrator agent (stub).
 *
 * Drafts the LP quarterly letter body from site + sales + finance
 * signals. Output is the QuarterlyLetterDraft shape used by the
 * composer; staff edits + sends.
 */

export interface QuarterlyNarratorInput {
  organizationId: string;
  fundId: string;
  period: string;
}

export interface QuarterlyNarratorOutput {
  subject: string;
  bodyMd: string;
  kpis: { label: string; value: string }[];
}

export async function draft(_input: QuarterlyNarratorInput): Promise<QuarterlyNarratorOutput> {
  return { subject: "", bodyMd: "", kpis: [] };
}

export const QUARTERLY_NARRATOR_AGENT = {
  agentCode: "quarterly-narrator",
  description: "Drafts LP quarterly letter from site + sales + finance signals.",
} as const;
