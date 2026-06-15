import "server-only";

import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { aiAgentBudgets, aiAssistantRuns } from "@/lib/db/schema/ai";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Server queries for the AI cost dashboard.
 *
 * - `getAiUsageByAssistant` aggregates run counts + spend per
 *   assistant_key across the last 30 days. Used by the snapshot row.
 * - `getRecentAiRuns` returns the latest 100 runs with cost + status
 *   for the run table.
 * - `getAiAgentBudgets` returns configured budgets for the budget panel.
 */

export interface AssistantUsageRow {
  assistantKey: string;
  runs: number;
  successCount: number;
  failureCount: number;
  budgetExceededCount: number;
  dryRunCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export async function getAiUsageByAssistant(opts?: {
  windowDays?: number;
}): Promise<AssistantUsageRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const since = new Date(
    Date.now() - (opts?.windowDays ?? 30) * 24 * 60 * 60 * 1000,
  );

  const rows = await db
    .select({
      assistantKey: aiAssistantRuns.assistantKey,
      runs: sql<number>`count(*)::int`,
      successCount: sql<number>`sum(case when ${aiAssistantRuns.status} in ('succeeded','success','dry_run') then 1 else 0 end)::int`,
      failureCount: sql<number>`sum(case when ${aiAssistantRuns.status} in ('failed','error') then 1 else 0 end)::int`,
      budgetExceededCount: sql<number>`sum(case when ${aiAssistantRuns.status} = 'budget_exceeded' then 1 else 0 end)::int`,
      dryRunCount: sql<number>`sum(case when ${aiAssistantRuns.status} = 'dry_run' then 1 else 0 end)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiAssistantRuns.totalTokens}), 0)::int`,
      totalCostUsd: sql<string>`coalesce(sum(${aiAssistantRuns.totalCostUsd}), 0)`,
    })
    .from(aiAssistantRuns)
    .where(
      and(
        gte(aiAssistantRuns.createdAt, since),
        or(
          eq(aiAssistantRuns.organizationId, orgId),
          isNull(aiAssistantRuns.organizationId),
        ),
      ),
    )
    .groupBy(aiAssistantRuns.assistantKey)
    .orderBy(desc(sql`count(*)`));

  return rows.map((r) => ({
    ...r,
    totalCostUsd: Number(r.totalCostUsd ?? 0),
  }));
}

export interface RecentAiRunRow {
  id: string;
  assistantKey: string;
  status: string;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalCostUsd: number | null;
  latencyMs: number | null;
  outputSummary: string | null;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export async function getRecentAiRuns(opts?: {
  limit?: number;
  assistantKey?: string;
}): Promise<RecentAiRunRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const limit = opts?.limit ?? 100;

  const orgPredicate = or(
    eq(aiAssistantRuns.organizationId, orgId),
    isNull(aiAssistantRuns.organizationId),
  );

  const rows = await db
    .select({
      id: aiAssistantRuns.id,
      assistantKey: aiAssistantRuns.assistantKey,
      status: aiAssistantRuns.status,
      model: aiAssistantRuns.model,
      promptTokens: aiAssistantRuns.promptTokens,
      completionTokens: aiAssistantRuns.completionTokens,
      totalCostUsd: aiAssistantRuns.totalCostUsd,
      latencyMs: aiAssistantRuns.latencyMs,
      outputSummary: aiAssistantRuns.outputSummary,
      errorMessage: aiAssistantRuns.errorMessage,
      createdAt: aiAssistantRuns.createdAt,
      finishedAt: aiAssistantRuns.finishedAt,
    })
    .from(aiAssistantRuns)
    .where(
      opts?.assistantKey
        ? and(eq(aiAssistantRuns.assistantKey, opts.assistantKey), orgPredicate)
        : orgPredicate,
    )
    .orderBy(desc(aiAssistantRuns.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    totalCostUsd: r.totalCostUsd != null ? Number(r.totalCostUsd) : null,
  }));
}

export async function getAiAgentBudgets() {
  const db = getDb();
  if (!db) return [];
  return await db
    .select()
    .from(aiAgentBudgets)
    .orderBy(aiAgentBudgets.assistantKey);
}

/**
 * Returns the today + this-month spend for a single assistant — used by
 * the budget panel to render utilisation bars without re-running
 * checkBudget (which is meant for pre-call gating).
 */
export async function getAiSpendWindows(
  assistantKey: string,
): Promise<{ todayUsd: number; monthUsd: number }> {
  const db = getDb();
  if (!db) return { todayUsd: 0, monthUsd: 0 };
  const orgId = await requireOrgId();

  const orgPredicate = or(
    eq(aiAssistantRuns.organizationId, orgId),
    isNull(aiAssistantRuns.organizationId),
  );

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );

  const [{ todayUsd }] = await db
    .select({
      todayUsd: sql<string>`coalesce(sum(${aiAssistantRuns.totalCostUsd}), 0)`,
    })
    .from(aiAssistantRuns)
    .where(
      and(
        eq(aiAssistantRuns.assistantKey, assistantKey),
        gte(aiAssistantRuns.createdAt, startOfDay),
        orgPredicate,
      ),
    );
  const [{ monthUsd }] = await db
    .select({
      monthUsd: sql<string>`coalesce(sum(${aiAssistantRuns.totalCostUsd}), 0)`,
    })
    .from(aiAssistantRuns)
    .where(
      and(
        eq(aiAssistantRuns.assistantKey, assistantKey),
        gte(aiAssistantRuns.createdAt, startOfMonth),
        orgPredicate,
      ),
    );

  return {
    todayUsd: Number(todayUsd ?? 0),
    monthUsd: Number(monthUsd ?? 0),
  };
}
