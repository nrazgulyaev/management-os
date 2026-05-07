import "server-only";

import {
  listActiveConnectionsForCron,
  syncMetricsForConnection,
} from "@/lib/marketing/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P4.F — Marketing metrics sync cron.
 *
 * Pulls yesterday's metrics for every active marketing connection.
 * Idempotent via `UNIQUE (campaign_id, metric_date)`. Runs every 3
 * hours.
 */
export async function runMarketingMetricsSync(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const connections = await listActiveConnectionsForCron();
  // Re-pull a 2-day window so revisions to recent rows pick up.
  const until = new Date();
  const since = new Date(until.getTime() - 2 * 24 * 60 * 60 * 1000);

  let succeeded = 0;
  let failed = 0;
  let inserted = 0;
  let updated = 0;
  for (const c of connections) {
    try {
      const r = await syncMetricsForConnection(c.id, { since, until });
      if (r.failed === 0) succeeded++;
      else failed++;
      inserted += r.inserted;
      updated += r.updated;
    } catch {
      failed++;
    }
  }
  return {
    status:
      failed === 0 ? "success" : succeeded > 0 ? "partial_success" : "failed",
    summary: `Synced metrics for ${succeeded}/${connections.length} connections (${inserted} new rows, ${updated} updated).`,
    metrics: {
      total_connections: connections.length,
      succeeded,
      failed,
      inserted,
      updated,
    },
  };
}
