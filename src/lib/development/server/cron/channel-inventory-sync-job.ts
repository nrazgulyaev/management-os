import "server-only";

import {
  listActiveConnectionsForCron,
  syncInventoryForConnection,
} from "@/lib/channel-manager/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P1.G.1 — Channel inventory sync cron.
 *
 * Pushes current availability to every active channel connection.
 * Runs every 15 minutes per the launch prompt schedule.
 *
 * Robust by design:
 *   - One bad connection does not abort the batch (each
 *     syncInventoryForConnection call wraps its provider dispatch in
 *     try/catch and degrades to a `failed` SyncResult).
 *   - Per-connection sync_log row captures success / failure for the
 *     UI's status dashboard.
 *   - DryRun providers are no-ops with apiCallsCount=0 — connections
 *     without credentials don't pollute cost dashboards.
 */
export async function runChannelInventorySync(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const connections = await listActiveConnectionsForCron();
  let succeeded = 0;
  let failed = 0;
  let totalApiCalls = 0;
  for (const c of connections) {
    try {
      const r = await syncInventoryForConnection(c.id, {
        triggerSource: "cron",
      });
      if (r.ok) succeeded++;
      else failed++;
      totalApiCalls += r.apiCallsCount;
    } catch {
      failed++;
    }
  }
  return {
    status: failed === 0 ? "success" : succeeded > 0 ? "partial_success" : "failed",
    summary: `Synced ${succeeded} of ${connections.length} connections (${totalApiCalls} API calls).`,
    metrics: {
      total_connections: connections.length,
      succeeded,
      failed,
      api_calls: totalApiCalls,
    },
  };
}
