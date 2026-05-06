import "server-only";

import {
  listActiveConnectionsForCron,
  syncRatesForConnection,
} from "@/lib/channel-manager/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P1.G.1 — Channel rates sync cron.
 *
 * Pushes per-day rates to every active channel connection. Runs every
 * 30 minutes — channels generally rate-limit rate pushes harder than
 * availability pushes, so we batch a half-hour cadence rather than
 * every-15-min.
 *
 * Skips connections with no rates configured (the service helper
 * returns ok:true with a "no rates configured" reason — that's not a
 * failure, just a no-op until the operator sets up rate plans).
 */
export async function runChannelRatesSync(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const connections = await listActiveConnectionsForCron();
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let totalApiCalls = 0;
  for (const c of connections) {
    try {
      const r = await syncRatesForConnection(c.id, {
        triggerSource: "cron",
      });
      if (!r.ok) failed++;
      else if (r.recordsProcessed === 0) skipped++;
      else succeeded++;
      totalApiCalls += r.apiCallsCount;
    } catch {
      failed++;
    }
  }
  return {
    status: failed === 0 ? "success" : succeeded > 0 ? "partial_success" : "failed",
    summary: `Pushed rates for ${succeeded} of ${connections.length} (${skipped} skipped, ${totalApiCalls} API calls).`,
    metrics: {
      total_connections: connections.length,
      succeeded,
      skipped,
      failed,
      api_calls: totalApiCalls,
    },
  };
}
