import "server-only";

import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { aggregateUsageForAllOrgs } from "@/lib/development/server/usage/usage-actions";

/**
 * Stage 5.J — daily usage rollup. For each active organization,
 * computes today's `daily_summary` row in `usage_metrics`.
 *
 * Idempotent: the unique index on
 * `(organization_id, period_start, period_end, metric_type)` lets us
 * re-run for the same day; the underlying action does an UPSERT.
 */
export async function runDevOsUsageMetricsAggregation(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const result = await aggregateUsageForAllOrgs({
    forDate: new Date(),
    metricType: "daily_summary",
  });
  if (!result.ok) {
    return {
      status: "failed",
      summary: result.error ?? "Usage aggregation failed",
      metrics: { processed: 0 },
      error: result.error,
    };
  }
  return {
    status: "success",
    summary: `Aggregated daily usage metrics for ${result.processed} organization(s).`,
    metrics: { processed: result.processed },
  };
}
