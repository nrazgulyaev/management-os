import "server-only";

import {
  listActiveConnectionsForCron,
  pullAndIngestReservationsForConnection,
} from "@/lib/channel-manager/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P1.G.1 — Channel reservations pull cron.
 *
 * Pulls modified-since reservations from every active channel
 * connection and runs each through `handleIncomingReservation` for
 * idempotent ingestion + projection. Runs every 5 minutes as the
 * webhook fallback — channels that drop or don't offer webhooks get
 * caught here.
 *
 * The polling timestamp is `connection.lastReservationSyncAt` (set
 * after every successful pull); subsequent runs only ask for changes
 * since then.
 */
export async function runChannelReservationsPull(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const connections = await listActiveConnectionsForCron();
  let succeeded = 0;
  let failed = 0;
  let totalReservations = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalConflicts = 0;
  for (const c of connections) {
    try {
      const r = await pullAndIngestReservationsForConnection(c.id);
      if (r.ok) succeeded++;
      else failed++;
      totalReservations += r.recordsProcessed;
      for (const o of r.ingestionOutcomes) {
        if (o === "created") totalCreated++;
        else if (o === "updated") totalUpdated++;
        else if (o === "conflict_pending") totalConflicts++;
      }
    } catch {
      failed++;
    }
  }
  return {
    status: failed === 0 ? "success" : succeeded > 0 ? "partial_success" : "failed",
    summary: `Pulled ${totalReservations} reservations from ${succeeded} of ${connections.length} connections (${totalCreated} created, ${totalUpdated} updated, ${totalConflicts} conflicts).`,
    metrics: {
      total_connections: connections.length,
      succeeded,
      failed,
      total_reservations: totalReservations,
      created: totalCreated,
      updated: totalUpdated,
      conflicts: totalConflicts,
    },
  };
}
