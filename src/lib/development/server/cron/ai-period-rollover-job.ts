import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { aiOrgUsageMonthly } from "@/lib/db/schema/ai";
import { organizations } from "@/lib/db/schema/saas";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P6-CATCHUP — month-end period rollover.
 *
 * On the 1st of each month the cron seeds a fresh `ai_org_usage_monthly`
 * row for every active organization. Idempotent — re-runs on the
 * same day are no-ops via the unique (org, year, month) index.
 *
 * The previous month's row is left in place as a permanent snapshot;
 * Stage 7.D Stripe sync reads those rows for metered billing.
 */
export async function runAiPeriodRollover(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const todayIso = now.toISOString().slice(0, 10);

  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.isActive, true));

  let inserted = 0;
  for (const o of orgs) {
    const result = await db
      .insert(aiOrgUsageMonthly)
      .values({
        organizationId: o.id,
        year,
        month,
        todayDate: todayIso,
      })
      .onConflictDoNothing()
      .returning({ id: aiOrgUsageMonthly.id });
    if (result.length > 0) inserted++;
  }

  // Stamp `today_*` reset for any rows whose `today_date` predates
  // today (defensive — the daily aggregator job covers this too).
  const reset = await db
    .update(aiOrgUsageMonthly)
    .set({
      todayRuns: 0,
      todayCostUsd: "0",
      todayDate: todayIso,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiOrgUsageMonthly.year, year),
        eq(aiOrgUsageMonthly.month, month),
        sql`(${aiOrgUsageMonthly.todayDate} IS NULL OR ${aiOrgUsageMonthly.todayDate} < ${todayIso}::date)`,
      ),
    )
    .returning({ id: aiOrgUsageMonthly.id });

  return {
    status: "success",
    summary: `Period rollover: ${inserted} new month rows + ${reset.length} today_* resets.`,
    metrics: { inserted, reset: reset.length },
  };
}
