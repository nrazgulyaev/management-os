import "server-only";

import { and, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { capitalDrawdowns } from "@/lib/db/schema/investor-capital";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Marks drawdowns whose `due_date < today` and status='requested' as
 * `overdue`. Idempotent: rows already in `overdue` state are skipped
 * by the WHERE clause.
 */
export async function runDevOsOverdueDrawdown(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { marked: 0 },
      error: "DB unavailable",
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const updated = await db
    .update(capitalDrawdowns)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        eq(capitalDrawdowns.status, "requested"),
        lte(capitalDrawdowns.dueDate, today),
      ),
    )
    .returning({
      id: capitalDrawdowns.id,
      commitmentId: capitalDrawdowns.commitmentId,
      drawdownNumber: capitalDrawdowns.drawdownNumber,
      dueDate: capitalDrawdowns.dueDate,
    });

  for (const row of updated) {
    await handle.event("info", "drawdown_marked_overdue", {
      drawdownId: row.id,
      commitmentId: row.commitmentId,
      drawdownNumber: row.drawdownNumber,
      dueDate: row.dueDate,
    });
  }

  // Total overdue (including pre-existing) for visibility.
  const [{ count }] = (await db.execute(sql`
    SELECT count(*)::int AS count
    FROM capital_drawdowns
    WHERE status = 'overdue'
  `)) as Array<{ count: number }>;

  return {
    status: "success",
    summary: `Marked ${updated.length} drawdowns overdue (${count} total currently overdue).`,
    metrics: { marked: updated.length, currentlyOverdue: count },
  };
}
