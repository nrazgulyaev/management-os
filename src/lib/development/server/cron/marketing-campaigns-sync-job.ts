import "server-only";

import {
  listActiveConnectionsForCron,
  syncCampaignsForConnection,
} from "@/lib/marketing/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P4.F — Marketing campaigns sync cron.
 *
 * Pulls campaign metadata from every active marketing connection
 * with `auto_sync_enabled=true`. One bad connection does not abort
 * the batch. Runs every 6 hours per the launch prompt.
 */
export async function runMarketingCampaignsSync(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const connections = await listActiveConnectionsForCron();
  let succeeded = 0;
  let failed = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  for (const c of connections) {
    try {
      const r = await syncCampaignsForConnection(c.id);
      if (r.ok) succeeded++;
      else failed++;
      totalInserted += r.inserted;
      totalUpdated += r.updated;
    } catch {
      failed++;
    }
  }
  return {
    status:
      failed === 0 ? "success" : succeeded > 0 ? "partial_success" : "failed",
    summary: `Synced ${succeeded}/${connections.length} marketing connections (${totalInserted} new, ${totalUpdated} updated).`,
    metrics: {
      total_connections: connections.length,
      succeeded,
      failed,
      inserted: totalInserted,
      updated: totalUpdated,
    },
  };
}
