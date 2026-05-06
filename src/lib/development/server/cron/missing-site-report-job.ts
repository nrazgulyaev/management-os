import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * For each project that has at least one active vendor engagement OR
 * one site_report in the past 14 days (proxy for "construction is
 * active"), checks whether today's site_report exists. Fires
 * `site_report_missing` notification per project per day.
 *
 * Idempotency: notification fires once per (project, day) — the
 * delivery_log dedup catches re-runs. Project filter excludes
 * dormant projects to avoid spam.
 */
export async function runDevOsMissingSiteReport(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { alerted: 0 },
      error: "DB unavailable",
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Active projects = projects with EITHER an active engagement OR a
  // site report in the past 14 days. Then filter to those WITHOUT a
  // report for today.
  const missing = await db.execute(sql`
    WITH active_projects AS (
      SELECT DISTINCT p.id, p.name
      FROM projects p
      WHERE EXISTS (
          SELECT 1 FROM vendor_engagements e
          WHERE e.project_id = p.id AND e.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM site_reports r
          WHERE r.project_id = p.id
            AND r.report_date >= ${fourteenDaysAgo}
        )
    )
    SELECT ap.id AS project_id, ap.name AS project_name
    FROM active_projects ap
    WHERE NOT EXISTS (
      SELECT 1 FROM site_reports r
      WHERE r.project_id = ap.id
        AND r.report_date = ${today}
    )
  `);

  let alerted = 0;
  for (const r of missing as Record<string, unknown>[]) {
    await handle.event("warning", "site_report_missing", {
      projectId: String(r.project_id),
      projectName: String(r.project_name),
      missingDate: today,
    });
    alerted += 1;
  }

  return {
    status: "success",
    summary: `${alerted} projects missing today's site report.`,
    metrics: { alerted, asOfDate: today },
  };
}
