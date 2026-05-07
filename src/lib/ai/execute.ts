import "server-only";

/**
 * Stage 6.P6-CATCHUP — `aiExecute()` unified server entrypoint.
 *
 * Every agent that wants org-scoped quota enforcement, automatic cost
 * tracking, and per-agent provider override should call `aiExecute()`
 * instead of touching `getAIProvider()` directly.
 *
 * Pipeline (in order):
 *   1. Resolve org + assistantKey from input.
 *   2. Check `ai_org_quota_limits` — if hard cap exceeded, return early
 *      with `decision: "blocked"`. Bypass-able for "internal" plan_code
 *      (Stage 7.B integration).
 *   3. Check per-assistant `aiAgentBudgets` (existing P3.A surface) —
 *      same block-when-exceeded contract.
 *   4. Resolve provider via `getAIProviderByName(name)` if a per-agent
 *      override is requested, else `getAIProvider()`.
 *   5. Issue the provider call.
 *   6. Persist the run to `ai_assistant_runs` (with cost) + bump
 *      `ai_org_usage_monthly` aggregates atomically.
 *   7. Return the response + the cost decision so the caller can render
 *      "you used $X today" widgets.
 *
 * Hard cap is enforced at step 2 — if `today_cost_usd >= daily_limit_usd`
 * **AND** `is_enabled = true`, the call is refused. The legacy budget
 * (step 3) remains a soft per-assistant guardrail for backward compat.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  aiAssistantRuns,
  aiOrgQuotaLimits,
  aiOrgUsageMonthly,
} from "@/lib/db/schema/ai";
import { checkBudget, type BudgetDecision } from "./budget";
import { computeCallCost } from "./cost";
import {
  getAIProvider,
  getAIProviderByName,
  type AICompletionRequest,
  type AICompletionResponse,
  type AIProvider,
} from "./providers";

export interface AiExecuteInput extends AICompletionRequest {
  organizationId: string;
  assistantKey: string;
  /** Optional override — `getAIProviderByName(name)`. */
  providerOverride?: "anthropic" | "openai" | "gemini" | "dry_run";
  /** Owning user (for audit). */
  triggeredByUserId?: string | null;
  /** Free-text label that lands on `ai_assistant_runs.input_summary`. */
  inputSummary?: string;
}

export type AiExecuteResult =
  | {
      ok: true;
      response: AICompletionResponse;
      runId: string;
      providerName: string;
      orgQuota: OrgQuotaSnapshot | null;
      legacyBudget: BudgetDecision;
    }
  | {
      ok: false;
      reason:
        | "quota_disabled"
        | "org_daily_exceeded"
        | "org_monthly_exceeded"
        | "legacy_budget_exceeded"
        | "provider_unavailable"
        | "provider_error"
        | "db_unavailable";
      message: string;
      orgQuota?: OrgQuotaSnapshot | null;
      legacyBudget?: BudgetDecision;
      runId?: string;
    };

export interface OrgQuotaSnapshot {
  organizationId: string;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  todayCostUsd: number;
  monthlyCostUsd: number;
  isEnabled: boolean;
  warnThresholdPct: number;
  highThresholdPct: number;
  reachedWarn: boolean;
  reachedHigh: boolean;
  reachedHardCap: boolean;
}

/**
 * Resolve the current quota snapshot for an org. Returns null when no
 * quota row exists (treated as "unlimited" — caller must opt in by
 * inserting an `ai_org_quota_limits` row).
 */
export async function snapshotOrgQuota(
  organizationId: string,
): Promise<OrgQuotaSnapshot | null> {
  const db = getDb();
  if (!db) return null;
  const [limit] = await db
    .select()
    .from(aiOrgQuotaLimits)
    .where(eq(aiOrgQuotaLimits.organizationId, organizationId))
    .limit(1);
  if (!limit) return null;

  const now = new Date();
  const [usage] = await db
    .select()
    .from(aiOrgUsageMonthly)
    .where(
      and(
        eq(aiOrgUsageMonthly.organizationId, organizationId),
        eq(aiOrgUsageMonthly.year, now.getUTCFullYear()),
        eq(aiOrgUsageMonthly.month, now.getUTCMonth() + 1),
      ),
    )
    .limit(1);

  const dailyLimit = Number(limit.dailyLimitUsd);
  const monthlyLimit = Number(limit.monthlyLimitUsd);
  const todayCost = usage ? Number(usage.todayCostUsd) : 0;
  const monthCost = usage ? Number(usage.totalCostUsd) : 0;

  return {
    organizationId,
    dailyLimitUsd: dailyLimit,
    monthlyLimitUsd: monthlyLimit,
    todayCostUsd: todayCost,
    monthlyCostUsd: monthCost,
    isEnabled: limit.isEnabled,
    warnThresholdPct: limit.warnThresholdPct,
    highThresholdPct: limit.highThresholdPct,
    reachedWarn:
      monthlyLimit > 0 &&
      monthCost / monthlyLimit >= limit.warnThresholdPct / 100,
    reachedHigh:
      monthlyLimit > 0 &&
      monthCost / monthlyLimit >= limit.highThresholdPct / 100,
    reachedHardCap:
      (dailyLimit > 0 && todayCost >= dailyLimit) ||
      (monthlyLimit > 0 && monthCost >= monthlyLimit),
  };
}

/**
 * Bump the per-(org, year, month) usage aggregate. UPSERT pattern via
 * Drizzle `onConflictDoUpdate`. Resets `today_*` when `today_date`
 * crosses midnight.
 */
async function bumpOrgUsage(args: {
  organizationId: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const todayIso = now.toISOString().slice(0, 10);

  await db
    .insert(aiOrgUsageMonthly)
    .values({
      organizationId: args.organizationId,
      year,
      month,
      totalRuns: 1,
      totalPromptTokens: BigInt(args.promptTokens),
      totalCompletionTokens: BigInt(args.completionTokens),
      totalCostUsd: args.costUsd.toFixed(4),
      todayRuns: 1,
      todayCostUsd: args.costUsd.toFixed(4),
      todayDate: todayIso,
    })
    .onConflictDoUpdate({
      target: [
        aiOrgUsageMonthly.organizationId,
        aiOrgUsageMonthly.year,
        aiOrgUsageMonthly.month,
      ],
      set: {
        totalRuns: sql`${aiOrgUsageMonthly.totalRuns} + 1`,
        totalPromptTokens: sql`${aiOrgUsageMonthly.totalPromptTokens} + ${BigInt(args.promptTokens)}`,
        totalCompletionTokens: sql`${aiOrgUsageMonthly.totalCompletionTokens} + ${BigInt(args.completionTokens)}`,
        totalCostUsd: sql`${aiOrgUsageMonthly.totalCostUsd} + ${args.costUsd.toFixed(4)}::numeric`,
        // today_* resets when the date rolls.
        todayRuns: sql`CASE WHEN ${aiOrgUsageMonthly.todayDate} = ${todayIso}::date THEN ${aiOrgUsageMonthly.todayRuns} + 1 ELSE 1 END`,
        todayCostUsd: sql`CASE WHEN ${aiOrgUsageMonthly.todayDate} = ${todayIso}::date THEN ${aiOrgUsageMonthly.todayCostUsd} + ${args.costUsd.toFixed(4)}::numeric ELSE ${args.costUsd.toFixed(4)}::numeric END`,
        todayDate: todayIso,
        updatedAt: new Date(),
      },
    });
}

/**
 * Internal — resolve the AI provider given an optional override.
 */
function resolveProvider(
  override?: "anthropic" | "openai" | "gemini" | "dry_run",
): AIProvider | null {
  if (override) {
    return getAIProviderByName(override);
  }
  return getAIProvider();
}

/**
 * Unified entrypoint.
 */
export async function aiExecute(
  input: AiExecuteInput,
): Promise<AiExecuteResult> {
  const db = getDb();
  if (!db) {
    return {
      ok: false,
      reason: "db_unavailable",
      message: "Database is not configured.",
    };
  }

  // Step 1: org-level quota check.
  const orgQuota = await snapshotOrgQuota(input.organizationId);
  if (orgQuota && !orgQuota.isEnabled) {
    return {
      ok: false,
      reason: "quota_disabled",
      message:
        "AI access is disabled for this organization. Contact support.",
      orgQuota,
    };
  }
  if (orgQuota?.reachedHardCap) {
    // Stamp the block timestamp.
    await db
      .update(aiOrgQuotaLimits)
      .set({ lastBlockedAt: new Date(), updatedAt: new Date() })
      .where(eq(aiOrgQuotaLimits.organizationId, input.organizationId));
    if (orgQuota.todayCostUsd >= orgQuota.dailyLimitUsd) {
      return {
        ok: false,
        reason: "org_daily_exceeded",
        message: `Daily AI quota exceeded ($${orgQuota.todayCostUsd.toFixed(2)} / $${orgQuota.dailyLimitUsd.toFixed(2)}).`,
        orgQuota,
      };
    }
    return {
      ok: false,
      reason: "org_monthly_exceeded",
      message: `Monthly AI quota exceeded ($${orgQuota.monthlyCostUsd.toFixed(2)} / $${orgQuota.monthlyLimitUsd.toFixed(2)}).`,
      orgQuota,
    };
  }

  // Step 2: legacy per-assistant budget.
  const legacy = await checkBudget(input.assistantKey);
  if (legacy.decision === "block") {
    return {
      ok: false,
      reason: "legacy_budget_exceeded",
      message: `Per-assistant budget gate (${legacy.reason}).`,
      legacyBudget: legacy,
      orgQuota,
    };
  }

  // Step 3: provider resolution + call.
  const provider = resolveProvider(input.providerOverride);
  if (!provider) {
    return {
      ok: false,
      reason: "provider_unavailable",
      message: input.providerOverride
        ? `Provider '${input.providerOverride}' is not configured.`
        : "No AI provider is available.",
      orgQuota,
      legacyBudget: legacy,
    };
  }

  const startedAt = Date.now();
  let response: AICompletionResponse;
  try {
    response = await provider.complete({
      messages: input.messages,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      responseFormat: input.responseFormat,
      model: input.model,
      timeoutMs: input.timeoutMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Persist the failed run for audit.
    const [failed] = await db
      .insert(aiAssistantRuns)
      .values({
        assistantKey: input.assistantKey,
        runType: "manual",
        status: "failed",
        model: input.model ?? provider.defaultModel,
        errorMessage: message,
        inputSummary: input.inputSummary ?? null,
        createdBy: input.triggeredByUserId ?? null,
        finishedAt: new Date(),
      })
      .returning({ id: aiAssistantRuns.id });
    return {
      ok: false,
      reason: "provider_error",
      message,
      runId: failed?.id,
      orgQuota,
      legacyBudget: legacy,
    };
  }
  const latency = Date.now() - startedAt;

  // Step 4: cost + persistence. Unknown models -> 0 cost (logged with a
  // null rate). Known models go through `computeCallCost`.
  const costSplit = computeCallCost({
    model: response.model,
    promptTokens: response.usage.promptTokens,
    completionTokens: response.usage.completionTokens,
  }) ?? {
    inputCostUsd: 0,
    outputCostUsd: 0,
    totalCostUsd: 0,
  };

  const [run] = await db
    .insert(aiAssistantRuns)
    .values({
      assistantKey: input.assistantKey,
      runType: "manual",
      status: "completed",
      model: response.model,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      latencyMs: latency,
      inputSummary: input.inputSummary ?? null,
      outputSummary: response.content.slice(0, 4000),
      inputCostUsd: costSplit.inputCostUsd.toFixed(4),
      outputCostUsd: costSplit.outputCostUsd.toFixed(4),
      totalCostUsd: costSplit.totalCostUsd.toFixed(4),
      createdBy: input.triggeredByUserId ?? null,
      finishedAt: new Date(),
    })
    .returning({ id: aiAssistantRuns.id });

  await bumpOrgUsage({
    organizationId: input.organizationId,
    promptTokens: response.usage.promptTokens,
    completionTokens: response.usage.completionTokens,
    costUsd: costSplit.totalCostUsd,
  });

  // Re-snapshot the quota so the caller sees post-charge state.
  const postQuota = await snapshotOrgQuota(input.organizationId);

  return {
    ok: true,
    response,
    runId: run.id,
    providerName: provider.name,
    orgQuota: postQuota,
    legacyBudget: legacy,
  };
}
