import "server-only";

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  aiAssistantRuns,
  aiOrgUsageMonthly,
} from "@/lib/db/schema/ai";
import { organizations } from "@/lib/db/schema/saas";
import { agentCodeToTier, modelToTier } from "@/lib/ai/router/tier-rules";
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
 * **Stage 7.0 retrofit (migration 0086)**: in addition to the realtime
 * counters, this cron also populates `by_agent` / `by_provider` /
 * `by_tier` JSONB columns by GROUP BY-ing yesterday's `ai_assistant_runs`
 * per-org. Dashboard reads these directly without a JOIN-per-render.
 *
 * Idempotent: multiple runs on the same day produce the same final
 * aggregate (the diff is computed and applied as a delta, not a
 * blind sum). The JSONB write replaces, not accumulates — so re-running
 * with the same input yields the same output.
 */

interface BreakdownBucket {
  runs: number;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
}

function emptyBucket(): BreakdownBucket {
  return { runs: 0, costUsd: 0, promptTokens: 0, completionTokens: 0 };
}

function inferProvider(model: string | null | undefined): string {
  if (!model) return "unknown";
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt")) return "openai";
  if (model.startsWith("gemini")) return "gemini";
  if (model.startsWith("dry-run")) return "dry_run";
  return "other";
}
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

  // -------------------------------------------------------------------------
  // Stage 7.0 retrofit — populate by_agent / by_provider / by_tier JSONB.
  //
  // The runs table is global (no org_id today); aggregator buckets by
  // (assistantKey, model) and writes the breakdowns to every active
  // org row for the current month. When org_id lands on
  // ai_assistant_runs (Stage 7+), this loop becomes per-org.
  // -------------------------------------------------------------------------
  const periodStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
  periodStart.setUTCHours(0, 0, 0, 0);

  const monthRuns = (await db
    .select({
      assistantKey: aiAssistantRuns.assistantKey,
      model: aiAssistantRuns.model,
      promptTokens: aiAssistantRuns.promptTokens,
      completionTokens: aiAssistantRuns.completionTokens,
      totalCostUsd: aiAssistantRuns.totalCostUsd,
    })
    .from(aiAssistantRuns)
    .where(
      and(
        gte(aiAssistantRuns.createdAt, periodStart),
        lt(aiAssistantRuns.createdAt, todayMidnight),
        eq(aiAssistantRuns.status, "completed"),
      ),
    )) as Array<{
    assistantKey: string;
    model: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
    totalCostUsd: string | null;
  }>;

  const byAgent: Record<string, BreakdownBucket> = {};
  const byProvider: Record<string, BreakdownBucket> = {};
  const byTier: Record<string, BreakdownBucket> = {};

  for (const r of monthRuns) {
    const cost = Number(r.totalCostUsd ?? 0);
    const pt = r.promptTokens ?? 0;
    const ct = r.completionTokens ?? 0;
    const provider = inferProvider(r.model);
    const tierKey = String(
      r.model ? modelToTier(r.model) : agentCodeToTier(r.assistantKey),
    );
    for (const [bucket, key] of [
      [byAgent, r.assistantKey],
      [byProvider, provider],
      [byTier, tierKey],
    ] as Array<[Record<string, BreakdownBucket>, string]>) {
      const cur = bucket[key] ?? emptyBucket();
      cur.runs += 1;
      cur.costUsd += cost;
      cur.promptTokens += pt;
      cur.completionTokens += ct;
      bucket[key] = cur;
    }
  }

  // Round costs to 4dp for stable JSON serialization.
  for (const bucket of [byAgent, byProvider, byTier]) {
    for (const k of Object.keys(bucket)) {
      bucket[k].costUsd = Math.round(bucket[k].costUsd * 10000) / 10000;
    }
  }

  // Apply the breakdowns to every active org row for the current month.
  await db
    .update(aiOrgUsageMonthly)
    .set({
      byAgent: byAgent as never,
      byProvider: byProvider as never,
      byTier: byTier as never,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiOrgUsageMonthly.year, year),
        eq(aiOrgUsageMonthly.month, month),
      ),
    );

  return {
    status: "success",
    summary: `Rolled ${rolled.length} org-usage row(s) forward to ${todayIso}; touched ${orgs.length} active org(s); ${runs} runs in the prior day; populated 3 breakdown jsonb columns from ${monthRuns.length} month-to-date runs.`,
    metrics: {
      rolled: rolled.length,
      touched: orgs.length,
      priorDayRuns: runs,
      breakdownRunsAggregated: monthRuns.length,
      uniqueAgents: Object.keys(byAgent).length,
      uniqueProviders: Object.keys(byProvider).length,
      uniqueTiers: Object.keys(byTier).length,
    },
  };
}
