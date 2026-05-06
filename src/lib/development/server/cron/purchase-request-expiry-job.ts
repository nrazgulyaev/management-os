import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 4.A.3 — Purchase request expiry alert cron.
 *
 * Finds purchase requests with `required_by_date < today` whose status
 * is not yet `po_created` / `cancelled` / `rejected`. Emits one warning
 * per overdue request. Schedule: daily 18:00.
 */
export async function runDevOsPurchaseRequestExpiry(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { overdue: 0 },
      error: "DB unavailable",
    };
  }
  const today = new Date().toISOString().slice(0, 10);
  const [agg] = await db.execute<{ cnt: number }>(sql`
    SELECT count(*)::int AS cnt
    FROM dev_os_purchase_requests
    WHERE required_by_date < ${today}::date
      AND status NOT IN ('po_created', 'cancelled', 'rejected')
  `);
  const cnt = agg?.cnt ?? 0;
  if (cnt > 0) {
    await handle.event("warning", "purchase_request_overdue", {
      count: cnt,
    });
  }
  return {
    status: "success",
    summary: `Purchase request expiry: ${cnt} requests past required-by-date and not yet ordered.`,
    metrics: { overdue: cnt },
  };
}
