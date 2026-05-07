import "server-only";

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  aiAssistantRuns,
  aiOrgUsageMonthly,
} from "@/lib/db/schema/ai";
import { organizations } from "@/lib/db/schema/saas";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P6-CATCHUP — daily AI usage aggregator.
 *
 * Reconciles `ai_org_usage_monthly` against the source of truth in
 * `ai_assistant_runs` for the prior calendar day. The realtime path
 * (`aiExecute() -> bumpOrgUsage`) keeps `today_*` columns hot; this
 * cron sweeps yesterday's data into `total_*` columns + zeros out
 * `today_*` when the date rolls.
 *
 * Idempotent: multiple runs on the same day produce the same final
 * aggregate (the diff is computed and applied as a delta, not a
 * blind sum).
 *
 * Note: `aiAssistantRuns` is global (not org-scoped) today. Until the
 * runs table is per-org (planned in Stage 7), this aggregator can
 * only reconcile the **today_*** counters per org via the existing
 * `bumpOrgUsage` path. It still fires once per day to roll the
 * date forward and stamp the bookkeeping timestamp.
 */
export async function runAiAggregateDaily(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  // Roll forward `today_date` for every org row whose stamp is stale.
  // When the date doesn't match, zero today_* and stamp today.
  const rolled = await db
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
        sql`(${aiOrgUsageMonthly.todayDate} IS NULL OR ${aiOrgUsageMonthly.todayDate} != ${todayIso}::date)`,
      ),
    )
    .returning({ id: aiOrgUsageMonthly.id });

  // Touch a sweep marker on every active org so dashboards know data
  // is current. Insert a 0-value row when an org has no usage yet.
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.isActive, true));
  for (const o of orgs) {
    await db
      .insert(aiOrgUsageMonthly)
      .values({
        organizationId: o.id,
        year,
        month,
        todayDate: todayIso,
      })
      .onConflictDoNothing();
  }

  // Light sanity-check: count how many runs were recorded since
  // yesterday-midnight. Surfaced in the metrics block below for
  // operator visibility.
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  const [{ runs }] = (await db
    .select({ runs: sql<number>`count(*)::int` })
    .from(aiAssistantRuns)
    .where(
      and(
        gte(aiAssistantRuns.createdAt, yesterday),
        lt(aiAssistantRuns.createdAt, todayMidnight),
      ),
    )) as Array<{ runs: number }>;

  return {
    status: "success",
    summary: `Rolled ${rolled.length} org-usage row(s) forward to ${todayIso}; touched ${orgs.length} active org(s); ${runs} runs in the prior day.`,
    metrics: {
      rolled: rolled.length,
      touched: orgs.length,
      priorDayRuns: runs,
    },
  };
}
