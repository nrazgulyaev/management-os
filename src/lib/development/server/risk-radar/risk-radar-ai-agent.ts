import "server-only";

import type { DetectedAlert } from "./risk-radar-detector";

/**
 * Stage 5.C — AI-augmented risk pattern detection.
 *
 * Layered on top of the rule-based detector. If `ANTHROPIC_API_KEY`
 * is missing or `AI_DRY_RUN=1`, this returns no extra alerts and the
 * cron continues with rule-based output only.
 *
 * The AI agent is given the rule-based alerts plus a small context
 * snapshot and asked to:
 *   1. Identify patterns the rules missed (cross-category correlations).
 *   2. Mark recurring incidents that match historic patterns.
 *
 * Output is the same `DetectedAlert` shape so the cron's persistence
 * loop is uniform across both sources.
 */

export interface AiRadarContext {
  ruleBasedAlerts: DetectedAlert[];
  snapshotSummary: {
    cashOnHandIdr: number;
    payrollRunwayWeeks: number;
    activeProjectCount: number;
    openQaQcCritical: number;
  };
}

export interface AiRadarResult {
  augmentedAlerts: DetectedAlert[];
  /** Rationale for the run — empty when dry-run. */
  reasoning: string;
  /** Metadata — provider/model/tokens. */
  metadata: Record<string, unknown>;
}

export async function runAiRiskRadar(
  _context: AiRadarContext,
): Promise<AiRadarResult> {
  const dryRun =
    process.env.AI_DRY_RUN === "1" || !process.env.ANTHROPIC_API_KEY;

  if (dryRun) {
    return {
      augmentedAlerts: [],
      reasoning: "",
      metadata: { dryRun: true },
    };
  }

  // Real-mode call would post to the AI provider with a structured
  // prompt + the rule-based alerts as context. We keep the network
  // call out of the test path so this module can be imported safely
  // in dry-run mode (which is the default in CI).
  return {
    augmentedAlerts: [],
    reasoning:
      "AI agent live mode not yet wired — defaulting to rule-based output only.",
    metadata: { dryRun: false, callMade: false },
  };
}
