import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { recomputeProjectCriticalPath } from "../schedule/schedule-actions";

/**
 * Stage 4.C.2 — Critical path recompute (daily 03:30).
 *
 * For each project that has at least one task, runs the pure CPM helper
 * and updates is_on_critical_path / early_start / late_finish /
 * total_float_days / cp_last_computed_at on every task.
 *
 * Idempotent — derived state recomputed from source-of-truth tables.
 * Refuses to run on projects whose dependency graph has cycles (logs an
 * error event but continues with the next project).
 */
export async function runDevOsCriticalPathRecompute(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { recomputed: 0 },
      error: "DB unavailable",
    };
  }

  // Pull projects that have at least one task (via work_packages).
  const result = await db.execute<{ project_id: string }>(sql`
    SELECT DISTINCT wp.project_id::text AS project_id
      FROM work_packages wp
      JOIN project_tasks t ON t.work_package_id = wp.id
  `);
  const rows =
    (result as unknown as { rows: Array<{ project_id: string }> }).rows ?? [];

  let recomputed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await recomputeProjectCriticalPath({ projectId: row.project_id });
      recomputed++;
    } catch (err) {
      failed++;
      await handle.event(
        "error",
        `CPM recompute failed for project ${row.project_id}: ${err instanceof Error ? err.message : String(err)}`,
        { projectId: row.project_id },
      );
    }
  }

  return {
    status: failed === 0 ? "success" : "partial_success",
    summary: `Recomputed CPM for ${recomputed} project(s)${failed ? `, ${failed} failed` : ""}.`,
    metrics: { recomputed, failed },
  };
}
