import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 4.B.3 — Investor portal request escalation (daily 09:00).
 *
 * Find investor_portal_requests that are still in `submitted` or
 * `under_review` after 5 days and escalate them via a structured event.
 *
 * Idempotent — read-only.
 */
export async function runDevOsInvestorRequestEscalation(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { escalated: 0 },
      error: "DB unavailable",
    };
  }

  const result = await db.execute<{
    request_code: string;
    investor_id: string;
    request_type: string;
    status: string;
    submitted_at: string;
    days_since: number;
  }>(sql`
    SELECT
      request_code,
      investor_id::text,
      request_type,
      status,
      submitted_at::text,
      EXTRACT(DAY FROM (now() - submitted_at))::int AS days_since
    FROM investor_portal_requests
    WHERE status IN ('submitted', 'under_review')
      AND submitted_at < now() - INTERVAL '5 days'
    ORDER BY submitted_at ASC
  `);

  const rows =
    rowsOf<{
        request_code: string;
        investor_id: string;
        request_type: string;
        status: string;
        submitted_at: string;
        days_since: number;
      }>(result);

  for (const row of rows) {
    await handle.event(
      "warning",
      `investor request ${row.request_code} stale (${row.days_since}d in '${row.status}')`,
      {
        requestCode: row.request_code,
        investorId: row.investor_id,
        requestType: row.request_type,
        daysSince: row.days_since,
      },
    );
  }

  return {
    status: "success",
    summary: `${rows.length} investor request(s) overdue (>5 days).`,
    metrics: { escalated: rows.length },
  };
}
