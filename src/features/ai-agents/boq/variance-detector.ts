/**
 * Phase 2.2 dev-03 — variance-detector agent (stub).
 *
 * Hourly + event-triggered on every boq_actuals write. Walks the
 * project's active revision, runs `computeVariance` per line, and
 * upserts a `variance_reviews` row for lines crossing the 5%
 * threshold.
 */

export interface VarianceDetectorInput {
  organizationId: string;
  projectId?: string;
}

export interface VarianceDetectorOutput {
  flagged: number;
  scanned: number;
}

export async function run(_input: VarianceDetectorInput): Promise<VarianceDetectorOutput> {
  return { flagged: 0, scanned: 0 };
}

export const VARIANCE_DETECTOR_AGENT = {
  agentCode: "variance-detector",
  cron: "0 * * * *",
  description: "Hourly + on-write scan of BOQ actuals; flags variances >5% into the QS review queue.",
} as const;
