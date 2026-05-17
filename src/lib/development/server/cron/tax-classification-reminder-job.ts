import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {} from "@/lib/db/schema/dev-finance";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 4.A.2 — Tax classification reminder cron.
 *
 * Counts dev_transactions older than 7 days that are still
 * `tax_classification_status = 'unclassified'` and emits a warning
 * event. Operator follows up via `/development-os/finance/tax-reports/missing`.
 * Schedule: daily 09:00.
 */
export async function runDevOsTaxClassificationReminder(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { unclassified_old: 0 },
      error: "DB unavailable",
    };
  }
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString();
  const [agg] = await db.execute<{ cnt: number; total_minor: string }>(sql`
    SELECT count(*)::int AS cnt,
           coalesce(sum(amount_usd_minor), 0)::text AS total_minor
    FROM dev_transactions
    WHERE tax_classification_status = 'unclassified'
      AND created_at < ${sevenDaysAgo}
  `);
  const cnt = agg?.cnt ?? 0;
  if (cnt > 0) {
    await handle.event("warning", "tax_classification_overdue", {
      unclassified_count: cnt,
      total_amount_usd_minor: agg?.total_minor ?? "0",
    });
  }
  return {
    status: "success",
    summary: `Tax classification reminder: ${cnt} unclassified txns older than 7 days.`,
    metrics: { unclassified_old: cnt },
  };
}
