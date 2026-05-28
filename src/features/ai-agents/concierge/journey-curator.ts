/**
 * Phase 2.4 mgmt-04 — journey-curator agent (stub).
 *
 * Daily scan of active stays. Creates DRAFT journey moments based
 * on:
 *   - check-in / -out windows (welcome / departure)
 *   - completed concierge actions (activity moments)
 *   - recovery comp events (recovery moments)
 *
 * Drafts need staff publish-click before they show in the guest
 * portal — staff can edit copy/photo first.
 */

export interface JourneyCuratorInput {
  organizationId: string;
  bookingId?: string;
}

export interface JourneyCuratorOutput {
  draftsCreated: number;
  draftsSkipped: number;
}

export async function run(_input: JourneyCuratorInput): Promise<JourneyCuratorOutput> {
  return { draftsCreated: 0, draftsSkipped: 0 };
}

export const JOURNEY_CURATOR_AGENT = {
  agentCode: "journey-curator",
  cron: "0 22 * * *",
  description: "Daily 22:00 scan of active stays; auto-creates draft journey moments.",
} as const;
