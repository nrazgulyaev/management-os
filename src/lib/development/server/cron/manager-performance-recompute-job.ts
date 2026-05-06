import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { persistManagerPerformanceSnapshot } from "../conversation-review/manager-performance-actions";

/**
 * Stage 5.E — Manager performance recompute (Mon 04:00).
 *
 * For every manager who has at least one assigned lead in the last 7
 * days, write a weekly performance snapshot. UNIQUE constraint on
 * (manager × period × type) makes the upsert idempotent.
 *
 * Conservative: empty conversations array → snapshot has zeroed metrics.
 */
export async function runDevOsManagerPerformanceRecompute(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { snapshots: 0 },
      error: "DB unavailable",
    };
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const managerRows = await db.execute<{ id: string; n: string }>(sql`
    SELECT assigned_manager_id::text AS id, COUNT(*)::text AS n
      FROM leads
     WHERE assigned_manager_id IS NOT NULL
       AND created_at >= ${weekStart.toISOString()}
     GROUP BY assigned_manager_id
  `);
  const managers =
    (managerRows as unknown as { rows: Array<{ id: string; n: string }> })
      .rows ?? [];

  let snapshots = 0;
  for (const m of managers) {
    const r = await persistManagerPerformanceSnapshot({
      managerId: m.id,
      periodStart: weekStart.toISOString().slice(0, 10),
      periodEnd: today.toISOString().slice(0, 10),
      periodType: "weekly",
      totalLeadsAssigned: Number(m.n),
      conversations: [],
    });
    if (r.ok) snapshots++;
  }

  await handle.event(
    "info",
    `manager performance snapshots persisted for ${snapshots} manager(s)`,
    { snapshots },
  );

  return {
    status: "success",
    summary: `Computed weekly snapshot for ${snapshots} manager(s).`,
    metrics: { snapshots, managersScanned: managers.length },
  };
}
