/**
 * Phase 2.4 mgmt-01 — conflict-investigator agent (stub).
 *
 * On each `conflict` sync event, looks at the last N pushes + the
 * channel's stated value + any rule-engine overrides and emits a
 * recommendation: "accept-channel", "force-ours", or "flag-and-
 * pause" with a rationale string. Ops still confirms via the
 * ConflictModal.
 */

import type { ConflictResolution } from "@/features/channels/conflict-resolver";

export interface ConflictInvestigatorInput {
  organizationId: string;
  rateCellId: string;
  villaId: string;
  channelId: string;
  date: string;
  ourValue: number;
  channelValue: number;
}

export interface ConflictInvestigatorOutput {
  recommendation: ConflictResolution;
  confidence: number;
  rationale: string;
  /** Past 7d delta histogram, used in the modal "why?" inline. */
  recentDriftSamples: { at: string; delta: number }[];
}

export async function investigate(_input: ConflictInvestigatorInput): Promise<ConflictInvestigatorOutput> {
  return {
    recommendation: "accept-channel",
    confidence: 0.0,
    rationale: "Stub recommendation pending real implementation.",
    recentDriftSamples: [],
  };
}

export const CONFLICT_INVESTIGATOR_AGENT = {
  agentCode: "conflict-investigator",
  description: "On each conflict sync event, recommends a resolution with a rationale.",
} as const;
