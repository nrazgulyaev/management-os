import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 4.C.1 — QA/QC deadline alert (daily 09:00).
 *
 * Issues with deadline within 7 days OR overdue, in non-terminal status.
 * Logs a warning event for each so operators can act.
 *
 * Pure read — no DB mutations.
 */
export async function runDevOsQaQcDeadlineAlert(
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

  const result = await db.execute<{
    issue_code: string;
    title: string;
    severity: string;
    status: string;
    deadline_at: string;
    days_until: number;
    assigned_to: string | null;
  }>(sql`
    SELECT
      issue_code,
      title,
      severity,
      status,
      deadline_at::text,
      (deadline_at - CURRENT_DATE)::int AS days_until,
      assigned_to::text AS assigned_to
    FROM qa_qc_issues
    WHERE status NOT IN ('accepted', 'closed')
      AND deadline_at IS NOT NULL
      AND deadline_at <= CURRENT_DATE + INTERVAL '7 days'
    ORDER BY deadline_at ASC
  `);
  const rows =
    (result as unknown as { rows: Array<Record<string, string | number | null>> })
      .rows ?? [];

  for (const row of rows) {
    await handle.event(
      "warning",
      `QA/QC ${row.issue_code} (${row.severity}) deadline ${row.days_until}d`,
      {
        issueCode: row.issue_code,
        severity: row.severity,
        status: row.status,
        deadlineAt: row.deadline_at,
        assignedTo: row.assigned_to,
      },
    );
  }

  return {
    status: "success",
    summary: `${rows.length} QA/QC issue(s) within deadline window.`,
    metrics: { alerted: rows.length },
  };
}
