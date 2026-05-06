import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 4.C.3 — Risk elevation alert (Monday 09:00).
 *
 * Risks with risk_score ≥ 15 (high probability × major impact) in
 * non-closed mitigation status. Logs a warning event for each.
 *
 * Pure read — no DB mutations.
 */
export async function runDevOsRiskElevationAlert(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { elevated: 0 },
      error: "DB unavailable",
    };
  }

  const result = await db.execute<{
    risk_code: string;
    title: string;
    project_id: string;
    risk_score: number;
    probability: string;
    impact: string;
    mitigation_status: string;
  }>(sql`
    SELECT
      risk_code,
      title,
      project_id::text,
      risk_score,
      probability,
      impact,
      mitigation_status
    FROM project_risks
    WHERE risk_score >= 15
      AND mitigation_status NOT IN ('closed_resolved', 'closed_realized')
    ORDER BY risk_score DESC
  `);
  const rows =
    (result as unknown as { rows: Array<Record<string, string | number>> })
      .rows ?? [];

  for (const row of rows) {
    await handle.event(
      "warning",
      `Risk ${row.risk_code} (score ${row.risk_score}) ${row.probability} × ${row.impact}`,
      {
        riskCode: row.risk_code,
        projectId: row.project_id,
        riskScore: row.risk_score,
        mitigationStatus: row.mitigation_status,
      },
    );
  }

  return {
    status: "success",
    summary: `${rows.length} elevated risk(s) (score ≥ 15) need attention.`,
    metrics: { elevated: rows.length },
  };
}
