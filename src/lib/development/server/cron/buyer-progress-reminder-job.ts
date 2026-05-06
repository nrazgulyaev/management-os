import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 4.B.3 — Buyer progress reminder (Monday 09:00).
 *
 * For each project with at least one active buyer, check whether the last
 * published buyer_progress_report is older than 30 days. If yes, log an
 * event for the operator (notification dispatch is left to the existing
 * notification rules system).
 *
 * Idempotent — read-only.
 */
export async function runDevOsBuyerProgressReminder(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { stale: 0 },
      error: "DB unavailable",
    };
  }

  const result = await db.execute<{
    project_id: string;
    last_published: string | null;
    days_since: number | null;
  }>(sql`
    WITH active_projects AS (
      SELECT DISTINCT v.project_id
        FROM buyer_unit_assignments bua
        JOIN villas v ON v.id = bua.unit_id
       WHERE bua.status NOT IN ('cancelled')
    ),
    last_reports AS (
      SELECT
        ap.project_id,
        MAX(bpr.published_at) AS last_published
      FROM active_projects ap
      LEFT JOIN buyer_progress_reports bpr
        ON bpr.project_id = ap.project_id
       AND bpr.status = 'published'
      GROUP BY ap.project_id
    )
    SELECT
      project_id,
      last_published::text,
      EXTRACT(DAY FROM (now() - COALESCE(last_published, '1970-01-01'::timestamptz)))::int AS days_since
    FROM last_reports
    WHERE last_published IS NULL
       OR last_published < now() - INTERVAL '30 days'
  `);

  const rows =
    (result as unknown as { rows: Array<{ project_id: string; last_published: string | null; days_since: number | null }> })
      .rows ?? [];

  for (const row of rows) {
    await handle.event(
      "warning",
      `project ${row.project_id} buyer report stale (${row.days_since ?? "?"} days since last published)`,
      { projectId: row.project_id, lastPublished: row.last_published },
    );
  }

  return {
    status: "success",
    summary: `${rows.length} project(s) need a fresh buyer progress report.`,
    metrics: { stale: rows.length },
  };
}
