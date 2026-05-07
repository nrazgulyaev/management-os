import "server-only";

import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { closedPeriods } from "@/lib/db/schema/banking";
import { bankConnections } from "@/lib/db/schema/banking";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P3.G — Period-close reminder cron.
 *
 * Daily check: for every org with active bank connections, has the
 * previous calendar month been closed? If not, surface a reminder
 * (the bookkeeper UI reads this metric; an alerts integration could
 * also page on it).
 *
 * The cron is intentionally read-only — it doesn't auto-close
 * periods. Closing happens manually from
 * `/development-os/finance/period-close`.
 */
export async function runPeriodCloseReminder(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();
  const prevMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const prevMonthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
  );
  const prevStartStr = prevMonthStart.toISOString().slice(0, 10);
  const prevEndStr = prevMonthEnd.toISOString().slice(0, 10);

  const orgs = await db
    .selectDistinct({ orgId: bankConnections.organizationId })
    .from(bankConnections)
    .where(eq(bankConnections.status, "active"));

  let pending = 0;
  for (const o of orgs) {
    const [closed] = await db
      .select({ id: closedPeriods.id })
      .from(closedPeriods)
      .where(
        and(
          eq(closedPeriods.organizationId, o.orgId),
          gte(closedPeriods.periodStart, prevStartStr),
          gte(closedPeriods.periodEnd, prevEndStr),
          isNull(closedPeriods.reopenedAt),
        ),
      )
      .limit(1);
    if (!closed) pending++;
  }

  // Reference sql to keep the import slot warm for future expansion
  // (sub-month / quarter / year reminders).
  void sql;

  return {
    status: "success",
    summary: `Checked ${orgs.length} orgs — ${pending} have not closed ${prevStartStr}..${prevEndStr}.`,
    metrics: {
      orgs: orgs.length,
      pending,
      previous_period_start: prevStartStr,
      previous_period_end: prevEndStr,
    },
  };
}
