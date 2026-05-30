import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 5.H.2 — Baseline variance recompute (daily 03:00).
 *
 * For each active baseline, walk its tasks and recompute variance
 * status from the GENERATED columns + classify into severity bucket.
 * The 3 GENERATED columns (start/finish/duration variance days) are
 * always live; this job only needs to refresh the `variance_status`
 * label and `computed_at`.
 *
 * Idempotent — uses an UPDATE based on the GENERATED column values.
 */
export async function runDevOsBaselineVarianceRecompute(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { updated: 0 },
      error: "DB unavailable",
    };
  }

  const result = await db.execute<{ updated: string }>(sql`
    WITH bumped AS (
      UPDATE schedule_variances
         SET variance_status = CASE
               WHEN finish_variance_days < 0 THEN 'ahead_of_schedule'
               WHEN finish_variance_days = 0 THEN 'on_schedule'
               WHEN finish_variance_days <= 3 THEN 'minor_delay'
               WHEN finish_variance_days <= 7 THEN 'moderate_delay'
               WHEN finish_variance_days <= 14 THEN 'major_delay'
               ELSE 'critical_delay'
             END,
             computed_at = now()
       WHERE baseline_id IN (
         SELECT id FROM schedule_baselines WHERE is_current_baseline = TRUE
       )
       RETURNING id
    )
    SELECT COUNT(*)::text AS updated FROM bumped
  `);
  const updated = Number(
    rowsOf<{ updated: string }>(result)[0]
      ?.updated ?? "0",
  );

  await handle.event("info", `variance recomputed for ${updated} task(s)`, {
    updated,
  });

  return {
    status: "success",
    summary: `Recomputed variance status on ${updated} task(s).`,
    metrics: { updated },
  };
}
