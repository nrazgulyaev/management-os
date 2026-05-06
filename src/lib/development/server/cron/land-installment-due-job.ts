import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 4.A.1 — Land installment due cron.
 *
 * Finds installments with status='pending' and due within the next 14
 * days; emits one warning per overdue installment. Schedule: daily 09:00.
 */
export async function runDevOsLandInstallmentDue(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { due_soon: 0, overdue: 0 },
      error: "DB unavailable",
    };
  }
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [dueSoon] = await db.execute<{ cnt: number }>(sql`
    SELECT count(*)::int AS cnt
    FROM land_payment_installments
    WHERE status = 'pending'
      AND due_date >= ${today}::date
      AND due_date <= ${horizon}::date
  `);
  const [overdue] = await db.execute<{ cnt: number }>(sql`
    SELECT count(*)::int AS cnt
    FROM land_payment_installments
    WHERE status = 'pending'
      AND due_date < ${today}::date
  `);
  if ((dueSoon?.cnt ?? 0) > 0) {
    await handle.event("info", "land_installment_due_soon", {
      count: dueSoon.cnt,
    });
  }
  if ((overdue?.cnt ?? 0) > 0) {
    await handle.event("warning", "land_installment_overdue", {
      count: overdue.cnt,
    });
  }
  return {
    status: "success",
    summary: `Land installments: ${dueSoon?.cnt ?? 0} due in 14d, ${overdue?.cnt ?? 0} overdue.`,
    metrics: {
      due_soon: dueSoon?.cnt ?? 0,
      overdue: overdue?.cnt ?? 0,
    },
  };
}
