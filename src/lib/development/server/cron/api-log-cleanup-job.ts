import "server-only";

import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { pruneOldApiLogs } from "@/lib/development/server/usage/usage-actions";

const RETENTION_DAYS = 90;

/**
 * Stage 5.J — prunes `api_request_log` rows older than 90 days. A row
 * is no longer audit-relevant after this window because the daily
 * `usage_metrics` row already aggregates the counts.
 */
export async function runDevOsApiLogCleanup(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const result = await pruneOldApiLogs({ olderThanDays: RETENTION_DAYS });
  if (!result.ok) {
    return {
      status: "failed",
      summary: result.error ?? "API log prune failed",
      metrics: { pruned: 0 },
      error: result.error,
    };
  }
  return {
    status: "success",
    summary: `Pruned API request log rows older than ${RETENTION_DAYS} days.`,
    metrics: { pruned: result.pruned, retentionDays: RETENTION_DAYS },
  };
}
