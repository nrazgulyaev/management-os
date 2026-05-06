import "server-only";

import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { pruneOldRateLimitBuckets } from "@/lib/development/server/usage/usage-actions";

/**
 * Stage 5.J — drops `rate_limit_buckets` rows whose `window_start`
 * is more than 24 hours old. Per-day buckets need a 24h+ retention so
 * the in-flight day still resolves; per-minute and per-hour buckets are
 * stale as soon as their window passes. Truncating to 24h is a safe
 * superset of all three windows.
 */
export async function runDevOsRateLimitCleanup(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const result = await pruneOldRateLimitBuckets();
  if (!result.ok) {
    return {
      status: "failed",
      summary: result.error ?? "Rate limit prune failed",
      metrics: { pruned: 0 },
      error: result.error,
    };
  }
  return {
    status: "success",
    summary: "Pruned rate limit buckets older than 24 hours.",
    metrics: { pruned: result.pruned },
  };
}
