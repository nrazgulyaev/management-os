import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  agentConfigurations,
  agentInvocationLog,
  agentOutputs,
} from "@/lib/db/schema/ai-agents";
import {
  enforceAgentBudget,
  type BudgetCaps,
  type BudgetWindow,
  type BudgetVerdict,
} from "../ai-memory/memory-helpers";
import { loadMemoryContext } from "../ai-memory/memory-loader";

/**
 * Stage 5.D — Shared runner for the 5 specialized agents + 2 recurring.
 *
 * Each agent supplies:
 *   - agentKey
 *   - per-invocation prep (load source data + memory)
 *   - the "build output" function that returns a structured payload
 *
 * The runner handles:
 *   - configuration lookup
 *   - budget + rate-limit enforcement
 *   - memory context loading
 *   - invocation logging
 *   - persisting agent_outputs row
 *
 * Provider invocation is OUT OF SCOPE here — agents are dry-run by default;
 * if `ANTHROPIC_API_KEY` is set, the agent's `buildOutput` may call the
 * provider itself (with the runner-provided memory context).
 */

export interface AgentRunArgs<TOutput> {
  agentKey: string;
  projectId: string | null;
  invocationType:
    | "user_triggered"
    | "cron_recurring"
    | "event_triggered"
    | "webhook_triggered";
  triggeredByUserId?: string | null;
  triggeredByEvent?: string | null;
  scopeEntityType?: string | null;
  scopeEntityId?: string | null;
  /** Provided structured payload (the agent computed it). */
  buildOutput: (args: {
    memoryContext: string;
    memoryIdsUsed: string[];
  }) => Promise<{
    outputCategory: string;
    title: string;
    summary: string;
    detailedOutput: TOutput;
    recommendedActions: string[];
    affectedEntities?: Record<string, unknown>;
    confidenceLevel?: "low" | "medium" | "high";
    reasoningSummary?: string;
    estimatedCostMinor?: number;
  }>;
}

export interface AgentRunResult {
  ok: boolean;
  status: string;
  invocationId?: string;
  outputCode?: string;
  error?: string;
  budgetVerdict?: BudgetVerdict;
}

async function loadConfig(agentKey: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(agentConfigurations)
    .where(eq(agentConfigurations.agentKey, agentKey))
    .limit(1);
  return rows[0] ?? null;
}

async function loadBudgetWindow(agentKey: string): Promise<BudgetWindow> {
  const db = getDb();
  if (!db) {
    return {
      spentDailyMinor: 0,
      spentMonthlyMinor: 0,
      invocationsLastHour: 0,
      invocationsToday: 0,
    };
  }
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(
    Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1),
  );
  const hourStart = new Date(Date.now() - 60 * 60 * 1000);

  const [spentRow] = await db
    .select({
      daily: sql<string>`COALESCE(SUM(CASE WHEN ${agentInvocationLog.invokedAt} >= ${todayStart.toISOString()} THEN COALESCE(${agentInvocationLog.costMinor}, 0) ELSE 0 END), 0)::text`,
      monthly: sql<string>`COALESCE(SUM(CASE WHEN ${agentInvocationLog.invokedAt} >= ${monthStart.toISOString()} THEN COALESCE(${agentInvocationLog.costMinor}, 0) ELSE 0 END), 0)::text`,
      hourly: sql<string>`COUNT(*) FILTER (WHERE ${agentInvocationLog.invokedAt} >= ${hourStart.toISOString()})::text`,
      today: sql<string>`COUNT(*) FILTER (WHERE ${agentInvocationLog.invokedAt} >= ${todayStart.toISOString()})::text`,
    })
    .from(agentInvocationLog)
    .where(eq(agentInvocationLog.agentKey, agentKey));

  return {
    spentDailyMinor: Number(spentRow?.daily ?? "0"),
    spentMonthlyMinor: Number(spentRow?.monthly ?? "0"),
    invocationsLastHour: Number(spentRow?.hourly ?? "0"),
    invocationsToday: Number(spentRow?.today ?? "0"),
  };
}

export async function runAgent<TOutput>(
  args: AgentRunArgs<TOutput>,
): Promise<AgentRunResult> {
  const db = getDb();
  if (!db) {
    return { ok: false, status: "failed", error: "DB not configured" };
  }
  const config = await loadConfig(args.agentKey);
  if (!config) {
    return {
      ok: false,
      status: "failed",
      error: `agent_configurations row missing for ${args.agentKey}`,
    };
  }
  if (!config.isActive) {
    return { ok: false, status: "failed", error: "agent disabled" };
  }

  const dryRun =
    process.env.AI_DRY_RUN === "1" || !process.env.ANTHROPIC_API_KEY;

  const caps: BudgetCaps = {
    dailyBudgetMinor: Number(config.dailyBudgetMinor ?? 0n),
    monthlyBudgetMinor: Number(config.monthlyBudgetMinor ?? 0n),
    perInvocationBudgetMinor: Number(config.perInvocationBudgetMinor ?? 0n),
    maxInvocationsPerHour: config.maxInvocationsPerHour,
    maxInvocationsPerDay: config.maxInvocationsPerDay,
  };

  // Pre-flight budget check using a conservative estimate.
  const estCost = caps.perInvocationBudgetMinor || 0;
  const window = await loadBudgetWindow(args.agentKey);
  const verdict = enforceAgentBudget({
    estimatedCostMinor: estCost,
    caps,
    window,
  });
  if (!verdict.allowed && !dryRun) {
    const reasonStatus =
      verdict.reason === "rate_limit_hour" ||
      verdict.reason === "rate_limit_day"
        ? "rate_limited"
        : "budget_exceeded";
    const inv = await db
      .insert(agentInvocationLog)
      .values({
        agentKey: args.agentKey,
        invocationType: args.invocationType,
        triggeredByUserId: args.triggeredByUserId ?? null,
        triggeredByEvent: args.triggeredByEvent ?? null,
        projectId: args.projectId,
        scopeEntityType: args.scopeEntityType ?? null,
        scopeEntityId: args.scopeEntityId ?? null,
        providerUsed: "skipped",
        status: reasonStatus,
        completedAt: new Date(),
      })
      .returning({ id: agentInvocationLog.id });
    return {
      ok: false,
      status: reasonStatus,
      invocationId: inv[0].id,
      budgetVerdict: verdict,
    };
  }

  const startedAt = Date.now();

  // Memory context.
  let memoryContext = "";
  let memoryIdsUsed: string[] = [];
  if (config.usesMemory && args.projectId) {
    const loaded = await loadMemoryContext({
      projectId: args.projectId,
      memoryTypes: (config.memoryTypesRelevant ?? []) as never,
      limit: config.maxMemoryItemsLoaded,
    });
    memoryContext = loaded.context;
    memoryIdsUsed = loaded.idsUsed;
  }

  let output;
  try {
    output = await args.buildOutput({ memoryContext, memoryIdsUsed });
  } catch (e) {
    const inv = await db
      .insert(agentInvocationLog)
      .values({
        agentKey: args.agentKey,
        invocationType: args.invocationType,
        triggeredByUserId: args.triggeredByUserId ?? null,
        triggeredByEvent: args.triggeredByEvent ?? null,
        projectId: args.projectId,
        scopeEntityType: args.scopeEntityType ?? null,
        scopeEntityId: args.scopeEntityId ?? null,
        memoryItemsLoaded: memoryIdsUsed.length,
        memoryIdsUsed,
        providerUsed: dryRun ? "dry_run" : "anthropic",
        status: "failed",
        errorMessage: e instanceof Error ? e.message : "unknown",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      })
      .returning({ id: agentInvocationLog.id });
    return {
      ok: false,
      status: "failed",
      invocationId: inv[0].id,
      error: e instanceof Error ? e.message : "unknown",
    };
  }

  const costMinor = dryRun ? 0 : output.estimatedCostMinor ?? 0;

  // Persist invocation.
  const invInsert = await db
    .insert(agentInvocationLog)
    .values({
      agentKey: args.agentKey,
      invocationType: args.invocationType,
      triggeredByUserId: args.triggeredByUserId ?? null,
      triggeredByEvent: args.triggeredByEvent ?? null,
      projectId: args.projectId,
      scopeEntityType: args.scopeEntityType ?? null,
      scopeEntityId: args.scopeEntityId ?? null,
      memoryItemsLoaded: memoryIdsUsed.length,
      memoryIdsUsed,
      providerUsed: dryRun ? "dry_run" : "anthropic",
      modelUsed: dryRun ? null : config.preferredModel,
      costMinor: BigInt(costMinor),
      status: dryRun ? "dry_run" : "completed",
      outputSummary: output.summary,
      outputFull: output.detailedOutput as never,
      operatorReviewStatus: config.requiresOperatorReview
        ? "awaiting_review"
        : "no_review_needed",
      completedAt: new Date(),
      durationMs: Date.now() - startedAt,
    })
    .returning({ id: agentInvocationLog.id });
  const invocationId = invInsert[0].id;

  // Generate next output_code: AGT-OUT-YYYY-NNNN
  const yyyy = new Date().getUTCFullYear();
  const seqRow = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM agent_outputs
     WHERE output_code LIKE ${`AGT-OUT-${yyyy}-%`}
  `);
  const seq =
    Number(
      (seqRow as unknown as { rows: Array<{ n: string }> }).rows?.[0]?.n ?? "0",
    ) + 1;
  const outputCode = `AGT-OUT-${yyyy}-${String(seq).padStart(4, "0")}`;

  await db.insert(agentOutputs).values({
    outputCode,
    agentKey: args.agentKey,
    invocationLogId: invocationId,
    projectId: args.projectId,
    scopeEntityType: args.scopeEntityType ?? null,
    scopeEntityId: args.scopeEntityId ?? null,
    outputCategory: output.outputCategory,
    title: output.title,
    summary: output.summary,
    detailedOutput: output.detailedOutput as never,
    recommendedActions: output.recommendedActions,
    affectedEntities: output.affectedEntities ?? null,
    confidenceLevel: output.confidenceLevel ?? "medium",
    reasoningSummary: output.reasoningSummary ?? null,
    status: config.requiresOperatorReview
      ? "awaiting_review"
      : "approved",
  });

  return {
    ok: true,
    status: dryRun ? "dry_run" : "completed",
    invocationId,
    outputCode,
  };
}
