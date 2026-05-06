/**
 * Stage 5.E — Content workflow pure helpers (no server-only).
 *
 * Pulled out of content-actions.ts so unit tests can import it
 * without dragging in the server-only module graph.
 */

export const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["in_production", "rejected", "archived"],
  in_production: ["pending_review", "draft", "archived"],
  pending_review: ["approved", "rejected", "in_production"],
  approved: ["scheduled", "rejected", "archived"],
  scheduled: ["published", "approved", "paused"],
  published: ["paused", "archived"],
  paused: ["scheduled", "archived"],
  rejected: ["draft", "archived"],
  archived: [],
};

export function isValidTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}
