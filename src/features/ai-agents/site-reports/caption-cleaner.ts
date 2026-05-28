/**
 * Phase 2.4 dev-01 — caption-cleaner agent (stub).
 *
 * Cleans voice-dictated caption + narration:
 *   - drops filler words ("uh", "right")
 *   - capitalises sentences
 *   - suggests milestone links based on the recent project plan
 */

export interface CaptionCleanerInput {
  projectId: string;
  raw: { caption: string; narration?: string };
}

export interface CaptionCleanerOutput {
  cleaned: { caption: string; narration?: string };
  suggestedMilestoneId?: string;
  /** 0..1 — milestone link confidence. */
  confidence: number;
}

export async function clean(_input: CaptionCleanerInput): Promise<CaptionCleanerOutput> {
  return { cleaned: { caption: "" }, confidence: 0 };
}

export const CAPTION_CLEANER_AGENT = {
  agentCode: "caption-cleaner",
  description: "Cleans voice transcripts + suggests milestone links for site frames.",
} as const;
