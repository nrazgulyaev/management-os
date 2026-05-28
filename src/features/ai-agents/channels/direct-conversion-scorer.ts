/**
 * Phase 2.4 mgmt-01 — direct-conversion-scorer agent (stub).
 *
 * Scores how likely a returning guest is to book direct (vs.
 * channeling through Airbnb again). Used by the marketing tile
 * to size the "savings opportunity" and to weight the WhatsApp
 * outreach queue.
 */

export interface DirectConversionScorerInput {
  organizationId: string;
  guestId: string;
}

export interface DirectConversionScorerOutput {
  score: number;
  /** Top features that drove the score, for the UI explainer. */
  signals: { label: string; weight: number }[];
}

export async function score(_input: DirectConversionScorerInput): Promise<DirectConversionScorerOutput> {
  return { score: 0, signals: [] };
}

export const DIRECT_CONVERSION_SCORER_AGENT = {
  agentCode: "direct-conversion-scorer",
  description: "Per-guest probability of converting from channel to direct on the next stay.",
} as const;
