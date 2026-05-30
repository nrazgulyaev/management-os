import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 5.I — Offline queue stats + housekeeping (daily 06:00).
 *
 * Aggregates per-status counts across the offline_action_queue, and
 * prunes rows in `completed`/`duplicate`/`rejected` status older than
 * 90 days. Idempotent — repeated runs become no-ops once the cutoff
 * window has been swept.
 */
export async function runDevOsOfflineQueueStats(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: {},
      error: "DB unavailable",
    };
  }

  const stats = await db.execute<{ sync_status: string; n: string }>(sql`
    SELECT sync_status, COUNT(*)::text AS n
      FROM offline_action_queue
     GROUP BY sync_status
  `);
  const statsRows =
    rowsOf<{ sync_status: string; n: string }>(stats);

  const pruned = await db.execute<{ deleted: string }>(sql`
    WITH del AS (
      DELETE FROM offline_action_queue
       WHERE sync_status IN ('completed', 'duplicate', 'rejected')
         AND synced_at < now() - INTERVAL '90 days'
       RETURNING id
    )
    SELECT COUNT(*)::text AS deleted FROM del
  `);
  const deletedCount = Number(
    rowsOf<{ deleted: string }>(pruned)[0]
      ?.deleted ?? "0",
  );

  await handle.event("info", `offline queue stats refreshed`, {
    statsRows,
    deletedCount,
  });

  return {
    status: "success",
    summary: `Queue stats refreshed; pruned ${deletedCount} historical row(s).`,
    metrics: { deletedCount, distinctStatusCount: statsRows.length },
  };
}
