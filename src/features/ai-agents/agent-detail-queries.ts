import "server-only";

/**
 * AI Cabinet depth pass — per-agent detail reads + per-org token usage.
 *
 * All reads org-scoped via requireOrgId() (TENANT-1). These power the
 * agent detail header (enabled state, logs, test-run result) and the
 * token-usage view, DERIVED from existing tables — no new migration:
 *
 *   · enabled state  ← getAgentEligibility() (plan-tier × org override)
 *   · recent runs     ← ai_assistant_runs (filtered by assistant_key)
 *   · token usage     ← ai_org_usage_monthly (org-scoped aggregates)
 *                       + ai_assistant_runs (per-agent month breakdown)
 *   · output payload  ← ai_assistant_runs (single row by id)
 */

import { desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { aiAssistantRuns, aiOrgUsageMonthly } from "@/lib/db/schema/ai";
import { requireOrgId } from "@/features/auth/require-org";
import { getAgentEligibility } from "./agent-config-actions";
import {
  CONFIGURABLE_AGENTS,
  type ConfigurableAgentKey,
} from "./agent-config-keys";

// ============================================================================
// Mgmt hyphenated code <-> runtime assistant key mapping
// ============================================================================

/**
 * The cabinet routes use hyphenated mgmt codes (concierge-auto-reply);
 * the runtime + config tables use underscored assistant keys
 * (daily_digest). Most map 1:1 via underscore; a handful of registry
 * display codes alias onto a canonical runtime key.
 */
const MGMT_CODE_TO_ASSISTANT_KEY: Record<string, string> = {
  "concierge-auto-reply": "concierge_handoff",
  "statement-preparer": "tax_assistant",
  "daily-digest": "daily_digest",
  "pricing-optimizer": "marketing_assistant",
  "owner-intelligence": "executive_business",
  "maintenance-triage": "weekly_plan",
  "executive-business": "executive_business",
  "tax-assistant": "tax_assistant",
  "weekly-plan": "weekly_plan",
  "marketing-assistant": "marketing_assistant",
  "procurement-analyst": "procurement_analyst",
  "inbox": "inbox",
  "memory": "memory",
};

export function assistantKeyForMgmtCode(agentCode: string): string {
  return MGMT_CODE_TO_ASSISTANT_KEY[agentCode] ?? agentCode.replace(/-/g, "_");
}

/** Whether the resolved key is one we can flip on/off (config-gated). */
export function isConfigurableAgent(key: string): key is ConfigurableAgentKey {
  return CONFIGURABLE_AGENTS.includes(key as ConfigurableAgentKey);
}

// ============================================================================
// Enabled state
// ============================================================================

export interface AgentEnabledState {
  /** Resolved runtime assistant key. */
  assistantKey: string;
  /** True iff configurable + plan allows + not org-disabled. */
  enabled: boolean;
  /** True iff this key is in CONFIGURABLE_AGENTS (so the toggle applies). */
  configurable: boolean;
  /** Short human reason when not enabled. */
  reason: string | null;
}

export async function getAgentEnabledState(
  agentCode: string,
): Promise<AgentEnabledState> {
  const assistantKey = assistantKeyForMgmtCode(agentCode);
  const configurable = isConfigurableAgent(assistantKey);
  if (!configurable) {
    return { assistantKey, enabled: false, configurable: false, reason: "Not a configurable agent" };
  }
  const db = getDb();
  if (!db) {
    return { assistantKey, enabled: false, configurable: true, reason: "Database unavailable" };
  }
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { assistantKey, enabled: false, configurable: true, reason: "No organization context" };
  }
  const elig = await getAgentEligibility(orgId, assistantKey);
  if (elig.eligible) {
    return { assistantKey, enabled: true, configurable: true, reason: null };
  }
  const reason =
    elig.reason === "disabled_by_org"
      ? "Disabled for this workspace"
      : elig.reason === "no_subscription"
        ? "No active subscription"
        : elig.reason === "plan_excludes_agent"
          ? "Not included in your plan"
          : "Unavailable";
  return { assistantKey, enabled: false, configurable: true, reason };
}

// ============================================================================
// Recent runs for one agent (for the "Logs" panel)
// ============================================================================

export interface AgentDetailRun {
  id: string;
  status: string;
  model: string | null;
  totalTokens: number | null;
  latencyMs: number | null;
  outputSummary: string | null;
  createdAt: string;
}

export async function listRunsForAgent(
  agentCode: string,
  limit = 8,
): Promise<{ runs: AgentDetailRun[]; total: number }> {
  const db = getDb();
  if (!db) return { runs: [], total: 0 };
  const assistantKey = assistantKeyForMgmtCode(agentCode);

  const rows = await db
    .select()
    .from(aiAssistantRuns)
    .where(eq(aiAssistantRuns.assistantKey, assistantKey))
    .orderBy(desc(aiAssistantRuns.createdAt))
    .limit(limit);

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiAssistantRuns)
    .where(eq(aiAssistantRuns.assistantKey, assistantKey));

  return {
    total: Number(count ?? 0),
    runs: rows.map((r) => ({
      id: r.id,
      status: r.status,
      model: r.model,
      totalTokens: r.totalTokens,
      latencyMs: r.latencyMs,
      outputSummary: r.outputSummary,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ============================================================================
// Single run payload (for JSON / PDF download routes + output detail)
// ============================================================================

export interface AgentRunPayload {
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
  totalCostUsd: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export async function getRunPayload(runId: string): Promise<AgentRunPayload | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(aiAssistantRuns)
    .where(eq(aiAssistantRuns.id, runId))
    .limit(1);
  if (!r) return null;
  return {
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
    totalCostUsd: r.totalCostUsd,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

// ============================================================================
// Per-org token / budget usage — DERIVED from ai_org_usage_monthly
// ============================================================================

export interface TokenUsageMonth {
  year: number;
  month: number;
  totalRuns: number;
  totalPromptTokens: bigint;
  totalCompletionTokens: bigint;
  totalCostUsdMinor: bigint;
  todayRuns: number;
  todayCostUsdMinor: bigint;
  /** { [agentKey]: { runs, costUsd, tokens } } from the daily aggregate cron. */
  byAgent: Record<string, { runs?: number; costUsd?: number; tokens?: number }>;
}

export interface TokenUsageView {
  current: TokenUsageMonth | null;
  history: TokenUsageMonth[];
  /** Per-agent run + token roll-up for the current month (live from runs). */
  agentBreakdown: Array<{
    assistantKey: string;
    runs: number;
    totalTokens: number;
    costUsdMinor: bigint;
  }>;
}

function usdNumericToMinor(numeric: string | number | null | undefined): bigint {
  if (numeric === null || numeric === undefined) return 0n;
  const n = typeof numeric === "string" ? Number(numeric) : numeric;
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n * 100));
}

export async function getTokenUsageView(): Promise<TokenUsageView> {
  const db = getDb();
  if (!db) return { current: null, history: [], agentBreakdown: [] };
  const orgId = await requireOrgId();

  const usageRows = await db
    .select()
    .from(aiOrgUsageMonthly)
    .where(eq(aiOrgUsageMonthly.organizationId, orgId))
    .orderBy(desc(aiOrgUsageMonthly.year), desc(aiOrgUsageMonthly.month))
    .limit(12);

  const months: TokenUsageMonth[] = usageRows.map((r) => ({
    year: r.year,
    month: r.month,
    totalRuns: r.totalRuns,
    totalPromptTokens: r.totalPromptTokens,
    totalCompletionTokens: r.totalCompletionTokens,
    totalCostUsdMinor: usdNumericToMinor(r.totalCostUsd),
    todayRuns: r.todayRuns,
    todayCostUsdMinor: usdNumericToMinor(r.todayCostUsd),
    byAgent: (r.byAgent as TokenUsageMonth["byAgent"]) ?? {},
  }));

  const now = new Date();
  const current =
    months.find((m) => m.year === now.getUTCFullYear() && m.month === now.getUTCMonth() + 1) ??
    months[0] ??
    null;

  // Live per-agent breakdown for the current month, derived from runs.
  // ai_assistant_runs is NOT org-scoped (no org column), so this is a
  // platform-wide view of agent activity this month; the monthly
  // aggregate above is the authoritative per-org figure.
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const breakdownRows = await db
    .select({
      assistantKey: aiAssistantRuns.assistantKey,
      runs: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiAssistantRuns.totalTokens}), 0)::int`,
      costUsd: sql<string>`coalesce(sum(${aiAssistantRuns.totalCostUsd}), 0)::text`,
    })
    .from(aiAssistantRuns)
    .where(gte(aiAssistantRuns.createdAt, monthStart))
    .groupBy(aiAssistantRuns.assistantKey)
    .orderBy(sql`count(*) desc`)
    .limit(30);

  return {
    current,
    history: months,
    agentBreakdown: breakdownRows.map((r) => ({
      assistantKey: r.assistantKey,
      runs: Number(r.runs ?? 0),
      totalTokens: Number(r.totalTokens ?? 0),
      costUsdMinor: usdNumericToMinor(r.costUsd),
    })),
  };
}
