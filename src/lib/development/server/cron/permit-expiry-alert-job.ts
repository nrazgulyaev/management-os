import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 4.A.1 — Permit expiry alert cron.
 *
 * Finds permits with `expires_at` within 30/60/90 days and emits one
 * warning per bucket. Schedule: daily 09:00.
 */
export async function runDevOsPermitExpiryAlert(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { expiring_30: 0, expiring_60: 0, expiring_90: 0 },
      error: "DB unavailable",
    };
  }
  const today = new Date().toISOString().slice(0, 10);
  const buckets = [30, 60, 90];
  const counts: Record<string, number> = {};
  for (const days of buckets) {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const [agg] = await db.execute<{ cnt: number }>(sql`
      SELECT count(*)::int AS cnt
      FROM project_permits
      WHERE expires_at IS NOT NULL
        AND expires_at >= ${today}::date
        AND expires_at <= ${cutoff}::date
        AND status NOT IN ('rejected','cancelled','expired')
    `);
    counts[`expiring_${days}`] = agg?.cnt ?? 0;
    if ((agg?.cnt ?? 0) > 0) {
      await handle.event("warning", `permit_expiring_${days}d`, {
        count: agg.cnt,
      });
    }
  }
  return {
    status: "success",
    summary: `Permit expiry: 30d=${counts.expiring_30}, 60d=${counts.expiring_60}, 90d=${counts.expiring_90}.`,
    metrics: counts,
  };
}
