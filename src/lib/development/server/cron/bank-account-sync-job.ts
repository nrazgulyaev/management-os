import "server-only";

import {
  listActiveConnectionsForCron,
  syncTransactionsForConnection,
} from "@/lib/banking/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P3.G — Bank-account sync cron.
 *
 * Pulls transactions from every active bank connection with
 * `auto_sync_enabled=true`. One bad connection does not abort the
 * batch — `syncTransactionsForConnection` wraps its provider call in
 * try/catch and degrades to `{ ok: false, error }`.
 *
 * Runs every hour per the launch prompt schedule.
 */
export async function runBankAccountSync(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const connections = await listActiveConnectionsForCron();
  let succeeded = 0;
  let failed = 0;
  let totalInserted = 0;
  let totalDuplicates = 0;
  for (const c of connections) {
    try {
      const r = await syncTransactionsForConnection(c.id);
      if (r.ok) succeeded++;
      else failed++;
      totalInserted += r.inserted;
      totalDuplicates += r.duplicates;
    } catch {
      failed++;
    }
  }
  return {
    status: failed === 0 ? "success" : succeeded > 0 ? "partial_success" : "failed",
    summary: `Synced ${succeeded}/${connections.length} connections (${totalInserted} new, ${totalDuplicates} duplicates).`,
    metrics: {
      total_connections: connections.length,
      succeeded,
      failed,
      inserted: totalInserted,
      duplicates: totalDuplicates,
    },
  };
}
