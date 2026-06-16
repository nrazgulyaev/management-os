import "server-only";

import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  aiAssistantRuns,
  aiAssistantToolCalls,
  aiOperationsSummaries,
} from "@/lib/db/schema/ai";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import { aiModel, isAiConfigured, isAiDryRun } from "@/lib/env";
import { buildOperationsSnapshot } from "./context";
import { deterministicFallbackSummary } from "./fallback";
import { callOperationsCopilot } from "./provider";
import { buildUserPrompt } from "./prompt";
import {
  OPERATIONS_COPILOT_KEY,
  type CopilotResponse,
  type OperationsSnapshot,
  type RunStatus,
} from "./types";

export interface RefreshSummaryOutcome {
  runId: string | null;
  summaryId: string | null;
  status: RunStatus;
  fallbackUsed: boolean;
  errorMessage?: string;
  latencyMs: number;
}

/**
 * Generate a fresh Operations Co-pilot summary. Called by the manual
 * refresh action and (optionally) by the disabled-by-default cron job.
 *
 * Behaviour:
 *   - If AI is disabled (no key OR AI_DRY_RUN=1) → write a `fallback`
 *     run + summary using `deterministicFallbackSummary`.
 *   - Otherwise call Anthropic; on schema/transport failure, persist
 *     the run as `failed` and write a fallback summary anyway so the
 *     dashboard always renders.
 */
export async function generateOperationsCopilotSummary(opts?: {
  triggerType?: "manual" | "scheduled";
}): Promise<RefreshSummaryOutcome> {
  const start = Date.now();
  const triggerType = opts?.triggerType ?? "manual";
  const db = getDb();
  if (!db) {
    return {
      runId: null,
      summaryId: null,
      status: "fallback",
      fallbackUsed: true,
      errorMessage: "database unavailable",
      latencyMs: Date.now() - start,
    };
  }

  const me = await getCurrentAppUser();
  // AI FOLLOW-ON (a) — attribute the run to its org (migration 0148). The
  // scheduled cron has no user session; requireOrgId() falls back to the
  // ARCONIQUE_DEFAULT seed org there (the backfill target). When neither a
  // session nor a seed org exists we leave it null — the read layer treats
  // a null-org run as a platform run visible to every org.
  const organizationId = await requireOrgId().catch(() => null);

  // Insert the run row up-front so tool-call rows have a parent FK and
  // the dashboard can show "running" if the page reloads mid-call.
  const [run] = await db
    .insert(aiAssistantRuns)
    .values({
      organizationId,
      assistantKey: OPERATIONS_COPILOT_KEY,
      runType: triggerType,
      status: "running",
      model: isAiConfigured() && !isAiDryRun() ? aiModel() : "fallback",
      createdBy: me?.id ?? null,
    })
    .returning({ id: aiAssistantRuns.id });

  const runId = run!.id;
  const snapshot = await buildOperationsSnapshot(new Date(), organizationId);
  const fallbackSummary = deterministicFallbackSummary(snapshot);

  let response: CopilotResponse = fallbackSummary;
  let status: RunStatus = "fallback";
  let errorMessage: string | undefined;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let inputSummary = `[fallback] generated from snapshot @ ${snapshot.generatedAt}`;
  let outputSummary = response.executiveSummary.slice(0, 500);

  if (isAiConfigured() && !isAiDryRun()) {
    const userPrompt = buildUserPrompt(snapshot);
    const out = await callOperationsCopilot(userPrompt, organizationId);
    promptTokens = out.promptTokens ?? 0;
    completionTokens = out.completionTokens ?? 0;
    totalTokens = out.totalTokens ?? promptTokens + completionTokens;
    inputSummary = `prompt(${userPrompt.length} chars), tools=${out.toolCalls.length}`;
    if (out.ok && out.response) {
      response = out.response;
      status = "succeeded";
      outputSummary = (out.rawText ?? response.executiveSummary).slice(0, 500);
    } else {
      status = "failed";
      errorMessage = out.errorMessage;
      outputSummary = `[fallback after error] ${errorMessage ?? "model error"}`.slice(0, 500);
    }

    // Persist tool calls — including blocked ones — for audit.
    if (out.toolCalls.length > 0) {
      await db.insert(aiAssistantToolCalls).values(
        out.toolCalls.map((tc) => ({
          runId,
          toolName: tc.toolName,
          inputJson: (tc.input ?? null) as typeof aiAssistantToolCalls.$inferInsert["inputJson"],
          status: tc.status,
          errorMessage: tc.errorMessage ?? null,
          outputSummary: null,
        })),
      );
    }
  }

  const latencyMs = Date.now() - start;

  // Mark prior summaries inactive so the dashboard always shows the
  // newest one.
  await db
    .update(aiOperationsSummaries)
    .set({ status: "archived" })
    .where(eq(aiOperationsSummaries.status, "active"));

  const [summaryRow] = await db
    .insert(aiOperationsSummaries)
    .values({
      runId,
      title: response.title,
      executiveSummary: response.executiveSummary,
      riskLevel: response.riskLevel,
      highlights:
        response.highlights as typeof aiOperationsSummaries.$inferInsert["highlights"],
      risks: response.risks as typeof aiOperationsSummaries.$inferInsert["risks"],
      recommendedActions:
        response.recommendedActions as typeof aiOperationsSummaries.$inferInsert["recommendedActions"],
      sourceSnapshot:
        snapshot as unknown as typeof aiOperationsSummaries.$inferInsert["sourceSnapshot"],
      status: "active",
      createdBy: me?.id ?? null,
    })
    .returning({ id: aiOperationsSummaries.id });

  await db
    .update(aiAssistantRuns)
    .set({
      status,
      latencyMs,
      promptTokens: promptTokens || null,
      completionTokens: completionTokens || null,
      totalTokens: totalTokens || null,
      inputSummary,
      outputSummary,
      errorMessage: errorMessage ?? null,
      finishedAt: new Date(),
    })
    .where(eq(aiAssistantRuns.id, runId));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `ai.operations_copilot.${status}`,
    entityType: "ai_assistant_run",
    entityId: runId,
    after: {
      triggerType,
      latencyMs,
      riskLevel: response.riskLevel,
      fallback: status !== "succeeded",
    },
  });

  return {
    runId,
    summaryId: summaryRow?.id ?? null,
    status,
    fallbackUsed: status !== "succeeded",
    errorMessage,
    latencyMs,
  };
}

// -----------------------------------------------------------------------------
// Read APIs (used by dashboard pages and tests)
// -----------------------------------------------------------------------------

export interface OperationsSummaryRow {
  id: string;
  runId: string | null;
  summaryDate: string;
  title: string;
  executiveSummary: string;
  riskLevel: string;
  highlights: CopilotResponse["highlights"];
  risks: CopilotResponse["risks"];
  recommendedActions: CopilotResponse["recommendedActions"];
  sourceSnapshot: OperationsSnapshot | null;
  status: string;
  createdAt: string;
}

function mapSummary(
  r: typeof aiOperationsSummaries.$inferSelect,
): OperationsSummaryRow {
  return {
    id: r.id,
    runId: r.runId,
    summaryDate: r.summaryDate,
    title: r.title,
    executiveSummary: r.executiveSummary,
    riskLevel: r.riskLevel,
    highlights: (r.highlights ?? []) as CopilotResponse["highlights"],
    risks: (r.risks ?? []) as CopilotResponse["risks"],
    recommendedActions:
      (r.recommendedActions ?? []) as CopilotResponse["recommendedActions"],
    sourceSnapshot: (r.sourceSnapshot ?? null) as OperationsSnapshot | null,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function getLatestOperationsSummary(): Promise<OperationsSummaryRow | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(aiOperationsSummaries)
    .where(eq(aiOperationsSummaries.status, "active"))
    .orderBy(desc(aiOperationsSummaries.createdAt))
    .limit(1);
  if (row) return mapSummary(row);
  // No active row — fall back to the most recent of any status.
  const [latest] = await db
    .select()
    .from(aiOperationsSummaries)
    .orderBy(desc(aiOperationsSummaries.createdAt))
    .limit(1);
  return latest ? mapSummary(latest) : null;
}

export async function listOperationsSummaries(opts?: {
  limit?: number;
}): Promise<OperationsSummaryRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(aiOperationsSummaries)
    .orderBy(desc(aiOperationsSummaries.createdAt))
    .limit(opts?.limit ?? 30);
  return rows.map(mapSummary);
}

// -----------------------------------------------------------------------------
// AI runs / tool-call inspector (admin-only surface)
// -----------------------------------------------------------------------------

export interface AssistantRunRow {
  id: string;
  assistantKey: string;
  runType: string;
  status: string;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  inputSummary: string | null;
  outputSummary: string | null;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export async function listAssistantRuns(opts?: {
  limit?: number;
  assistantKey?: string;
}): Promise<AssistantRunRow[]> {
  const db = getDb();
  if (!db) return [];
  // AI FOLLOW-ON (a) — org-scope the runs inspector (migration 0148). Shows
  // the caller's org runs plus null-org (platform / un-attributed) runs.
  const orgId = await requireOrgId().catch(() => null);
  const orgFilter = orgId
    ? or(
        eq(aiAssistantRuns.organizationId, orgId),
        isNull(aiAssistantRuns.organizationId),
      )
    : undefined;
  const rows = await db
    .select()
    .from(aiAssistantRuns)
    .where(
      and(
        opts?.assistantKey
          ? eq(aiAssistantRuns.assistantKey, opts.assistantKey)
          : undefined,
        orgFilter,
      ),
    )
    .orderBy(desc(aiAssistantRuns.createdAt))
    .limit(opts?.limit ?? 50);
  return rows.map((r) => ({
    id: r.id,
    assistantKey: r.assistantKey,
    runType: r.runType,
    status: r.status,
    model: r.model,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalTokens: r.totalTokens,
    latencyMs: r.latencyMs,
    inputSummary: r.inputSummary,
    outputSummary: r.outputSummary,
    errorMessage: r.errorMessage,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));
}

export interface AssistantToolCallRow {
  id: string;
  runId: string;
  toolName: string;
  inputJson: unknown;
  outputSummary: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export async function getAssistantRunDetail(runId: string): Promise<{
  run: AssistantRunRow | null;
  toolCalls: AssistantToolCallRow[];
}> {
  const db = getDb();
  if (!db) return { run: null, toolCalls: [] };
  // AI FOLLOW-ON (a) — org-scope the detail lookup (migration 0148) so a
  // guessed run UUID can't read another tenant's run. Null-org (platform)
  // runs stay readable by any org.
  const orgId = await requireOrgId().catch(() => null);
  const orgFilter = orgId
    ? or(
        eq(aiAssistantRuns.organizationId, orgId),
        isNull(aiAssistantRuns.organizationId),
      )
    : undefined;
  const [r] = await db
    .select()
    .from(aiAssistantRuns)
    .where(and(eq(aiAssistantRuns.id, runId), orgFilter))
    .limit(1);
  if (!r) return { run: null, toolCalls: [] };

  const calls = await db
    .select()
    .from(aiAssistantToolCalls)
    .where(eq(aiAssistantToolCalls.runId, runId))
    .orderBy(aiAssistantToolCalls.createdAt);

  return {
    run: {
      id: r.id,
      assistantKey: r.assistantKey,
      runType: r.runType,
      status: r.status,
      model: r.model,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.totalTokens,
      latencyMs: r.latencyMs,
      inputSummary: r.inputSummary,
      outputSummary: r.outputSummary,
      errorMessage: r.errorMessage,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    },
    toolCalls: calls.map((c) => ({
      id: c.id,
      runId: c.runId,
      toolName: c.toolName,
      inputJson: c.inputJson,
      outputSummary: c.outputSummary,
      status: c.status,
      errorMessage: c.errorMessage,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export { buildOperationsSnapshot, deterministicFallbackSummary };
