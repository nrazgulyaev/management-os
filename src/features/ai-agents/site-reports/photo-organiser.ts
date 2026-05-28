/**
 * Phase 2.4 dev-01 — photo-organiser agent (stub).
 *
 * Daily scan that perceptual-hashes site_frames photos within a
 * project + day to find duplicates. Returns a suggestion list (NOT
 * an autoremove) so the construction lead can review before
 * confirming.
 */

export interface PhotoOrganiserInput {
  organizationId: string;
  projectId?: string;
}

export interface PhotoOrganiserSuggestion {
  /** Group of frames considered duplicate (size ≥ 2). */
  frameIds: string[];
  /** Recommended keeper. */
  keeperId: string;
  /** 0..1 perceptual similarity. */
  similarity: number;
}

export interface PhotoOrganiserOutput {
  suggestions: PhotoOrganiserSuggestion[];
}

export async function run(_input: PhotoOrganiserInput): Promise<PhotoOrganiserOutput> {
  return { suggestions: [] };
}

export const PHOTO_ORGANISER_AGENT = {
  agentCode: "photo-organiser",
  cron: "0 2 * * *",
  description: "Nightly 02:00 duplicate-cluster suggestion for site_frames.",
} as const;
