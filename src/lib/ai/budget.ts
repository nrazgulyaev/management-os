import "server-only";

import { and, eq, gte, sum } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { aiAgentBudgets, aiAssistantRuns } from "@/lib/db/schema/ai";

/**
 * Per-assistant_key spend enforcement.
 *
 * Every agent should call `assertBudgetAvailable(assistantKey)` before
 * issuing a provider request. The check is intentionally read-only:
 * it sums actual logged USD spend in `ai_assistant_runs` over the
 * day/month windows and compares against the row in `ai_agent_budgets`.
 *
 * If the budget is exceeded the function returns a `BudgetDecision`
 * with `decision='block'` — the agent should write a 'budget_exceeded'
 * row in `ai_assistant_runs` and skip the provider call. Otherwise it
 * returns `decision='allow'` and the agent proceeds.
 *
 * Missing budget row = unlimited. This matches the v8B design where
 * the operations-copilot assistant ran without ceilings; Stage 3.A
 * adds opt-in ceilings for new assistants without breaking existing
 * surfaces.
 */

export type BudgetDecision =
  | { decision: "allow"; reason: "no_budget_configured" }
  | {
      decision: "allow";
      reason: "within_limits";
      dailySpentUsd: number;
      dailyLimitUsd: number;
      monthlySpentUsd: number;
      monthlyLimitUsd: number;
      isWarning: boolean;
    }
  | {
      decision: "block";
      reason: "daily_exceeded" | "monthly_exceeded" | "disabled";
      dailySpentUsd: number;
      dailyLimitUsd: number;
      monthlySpentUsd: number;
      monthlyLimitUsd: number;
    };

export async function checkBudget(assistantKey: string): Promise<BudgetDecision> {
  const db = getDb();
  if (!db) {
    // Without DB we cannot record spend; allow but flag explicitly.
    return { decision: "allow", reason: "no_budget_configured" };
  }

  const [budget] = await db
    .select()
    .from(aiAgentBudgets)
    .where(eq(aiAgentBudgets.assistantKey, assistantKey))
    .limit(1);

  if (!budget) {
    return { decision: "allow", reason: "no_budget_configured" };
  }

  if (!budget.isEnabled) {
    return {
      decision: "block",
      reason: "disabled",
      dailySpentUsd: 0,
      dailyLimitUsd: Number(budget.dailyLimitUsd),
      monthlySpentUsd: 0,
      monthlyLimitUsd: Number(budget.monthlyLimitUsd),
    };
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );

  const [{ dailySpent }] = await db
    .select({ dailySpent: sum(aiAssistantRuns.totalCostUsd) })
    .from(aiAssistantRuns)
    .where(
      and(
        eq(aiAssistantRuns.assistantKey, assistantKey),
        gte(aiAssistantRuns.createdAt, startOfDay),
      ),
    );
  const [{ monthlySpent }] = await db
    .select({ monthlySpent: sum(aiAssistantRuns.totalCostUsd) })
    .from(aiAssistantRuns)
    .where(
      and(
        eq(aiAssistantRuns.assistantKey, assistantKey),
        gte(aiAssistantRuns.createdAt, startOfMonth),
      ),
    );

  const dailySpentUsd = Number(dailySpent ?? 0);
  const monthlySpentUsd = Number(monthlySpent ?? 0);
  const dailyLimitUsd = Number(budget.dailyLimitUsd);
  const monthlyLimitUsd = Number(budget.monthlyLimitUsd);

  if (dailySpentUsd >= dailyLimitUsd) {
    return {
      decision: "block",
      reason: "daily_exceeded",
      dailySpentUsd,
      dailyLimitUsd,
      monthlySpentUsd,
      monthlyLimitUsd,
    };
  }
  if (monthlySpentUsd >= monthlyLimitUsd) {
    return {
      decision: "block",
      reason: "monthly_exceeded",
      dailySpentUsd,
      dailyLimitUsd,
      monthlySpentUsd,
      monthlyLimitUsd,
    };
  }

  const dailyPct = (dailySpentUsd / dailyLimitUsd) * 100;
  const monthlyPct = (monthlySpentUsd / monthlyLimitUsd) * 100;
  const threshold = budget.alertThresholdPct;

  return {
    decision: "allow",
    reason: "within_limits",
    dailySpentUsd,
    dailyLimitUsd,
    monthlySpentUsd,
    monthlyLimitUsd,
    isWarning: dailyPct >= threshold || monthlyPct >= threshold,
  };
}
