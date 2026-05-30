import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 5.I — Failed subscriptions cleanup (daily 02:00).
 *
 * Marks subscriptions inactive once they've accumulated > 5
 * consecutive failures. Idempotent — re-running the same query
 * touches no rows after the first sweep.
 */
export async function runDevOsFailedSubscriptionsCleanup(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { deactivated: 0 },
      error: "DB unavailable",
    };
  }

  const result = await db.execute<{ updated: string }>(sql`
    WITH bumped AS (
      UPDATE push_subscriptions
         SET is_active = FALSE,
             unsubscribed_at = now()
       WHERE is_active = TRUE
         AND consecutive_failures > 5
       RETURNING id
    )
    SELECT COUNT(*)::text AS updated FROM bumped
  `);
  const deactivated = Number(
    rowsOf<{ updated: string }>(result)[0]
      ?.updated ?? "0",
  );

  await handle.event(
    "info",
    `deactivated ${deactivated} subscription(s) over failure cap`,
    { deactivated },
  );

  return {
    status: "success",
    summary: `Deactivated ${deactivated} subscription(s).`,
    metrics: { deactivated },
  };
}
