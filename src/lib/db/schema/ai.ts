import {
  bigint,
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  date,
  numeric,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { organizations } from "./saas";

/**
 * AI Operations Co-pilot v0 — see ADR-0011.
 *   - `ai_assistant_runs` — one row per Co-pilot invocation, captures
 *     status, model, token counts, latency, and the input/output summary
 *     (truncated, no PII / financial detail).
 *   - `ai_assistant_tool_calls` — append-only log of every tool dispatch,
 *     including blocked attempts (read-only allowlist enforcement).
 *   - `ai_operations_summaries` — the latest narrative + structured
 *     highlights / risks / recommended-actions rendered in the dashboard.
 */

export const aiAssistantRuns = pgTable(
  "ai_assistant_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // AI FOLLOW-ON (a), migration 0148 — per-org attribution for the
    // per-agent Logs panel + token/cost usage breakdown. NULLABLE: writers
    // without an org context (Development-OS engines, cron ops summaries)
    // leave it null, and the read layer treats null as a platform/un-
    // attributed run visible to every org.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    assistantKey: text("assistant_key").notNull(),
    runType: text("run_type").notNull().default("manual"),
    status: text("status").notNull().default("running"),
    model: text("model"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    latencyMs: integer("latency_ms"),
    inputSummary: text("input_summary"),
    outputSummary: text("output_summary"),
    errorMessage: text("error_message"),
    // Stage 3.A — USD cost computed from token counts × per-model rate.
    inputCostUsd: numeric("input_cost_usd", { precision: 12, scale: 4 }),
    outputCostUsd: numeric("output_cost_usd", { precision: 12, scale: 4 }),
    totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 4 }),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("ai_runs_assistant_idx").on(t.assistantKey),
    index("ai_runs_status_idx").on(t.status),
    index("ai_runs_created_idx").on(t.createdAt),
    // Migration 0148 — org-scoped reads (usage roll-up + per-agent Logs).
    index("ai_runs_org_idx").on(t.organizationId),
    index("ai_runs_org_assistant_idx").on(t.organizationId, t.assistantKey),
  ],
);

export const aiAssistantToolCalls = pgTable(
  "ai_assistant_tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => aiAssistantRuns.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    inputJson: jsonb("input_json"),
    outputSummary: text("output_summary"),
    status: text("status").notNull().default("success"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_tool_calls_run_idx").on(t.runId),
    index("ai_tool_calls_tool_idx").on(t.toolName),
    index("ai_tool_calls_status_idx").on(t.status),
  ],
);

export const aiOperationsSummaries = pgTable(
  "ai_operations_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => aiAssistantRuns.id, {
      onDelete: "set null",
    }),
    summaryDate: date("summary_date")
      .notNull()
      .default(sql`CURRENT_DATE`),
    title: text("title").notNull(),
    executiveSummary: text("executive_summary").notNull(),
    riskLevel: text("risk_level").notNull().default("normal"),
    highlights: jsonb("highlights").notNull().default(sql`'[]'::jsonb`),
    risks: jsonb("risks").notNull().default(sql`'[]'::jsonb`),
    recommendedActions: jsonb("recommended_actions")
      .notNull()
      .default(sql`'[]'::jsonb`),
    sourceSnapshot: jsonb("source_snapshot"),
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_ops_summaries_date_idx").on(t.summaryDate),
    index("ai_ops_summaries_status_idx").on(t.status),
    index("ai_ops_summaries_created_idx").on(t.createdAt),
  ],
);

export type AiAssistantRun = typeof aiAssistantRuns.$inferSelect;
export type NewAiAssistantRun = typeof aiAssistantRuns.$inferInsert;
export type AiAssistantToolCall = typeof aiAssistantToolCalls.$inferSelect;
export type NewAiAssistantToolCall = typeof aiAssistantToolCalls.$inferInsert;
export type AiOperationsSummary = typeof aiOperationsSummaries.$inferSelect;
export type NewAiOperationsSummary = typeof aiOperationsSummaries.$inferInsert;

/**
 * Stage 3.A — per-assistant_key spend ceilings. Checked before every
 * provider call by `lib/ai/budget.ts`. When the daily or monthly USD
 * limit is hit, the call short-circuits and writes a 'budget_exceeded'
 * row in `ai_assistant_runs` (no Anthropic charge incurred).
 */
export const aiAgentBudgets = pgTable(
  "ai_agent_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assistantKey: text("assistant_key").notNull().unique(),
    dailyLimitUsd: numeric("daily_limit_usd", {
      precision: 10,
      scale: 2,
    }).notNull(),
    monthlyLimitUsd: numeric("monthly_limit_usd", {
      precision: 10,
      scale: 2,
    }).notNull(),
    alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
    isEnabled: boolean("is_enabled").notNull().default(true),
    lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ai_agent_budgets_enabled_idx").on(t.isEnabled)],
);

export type AiAgentBudget = typeof aiAgentBudgets.$inferSelect;
export type NewAiAgentBudget = typeof aiAgentBudgets.$inferInsert;

/**
 * Stage 3.B — translation cache. Lookup key is `(sha256(text+'|'+context),
 * target_language)`. Hit count + last_used_at let us prune cold rows
 * later without losing recent activity.
 */
export const aiTranslationCache = pgTable(
  "ai_translation_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceTextHash: text("source_text_hash").notNull(),
    targetLanguage: text("target_language").notNull(),
    translatedText: text("translated_text").notNull(),
    sourceLanguage: text("source_language"),
    context: text("context"),
    hitCount: integer("hit_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_translation_cache_lookup_idx").on(
      t.sourceTextHash,
      t.targetLanguage,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Stage 6.P6-CATCHUP — Org-scoped AI quotas (migration 0083).
// ---------------------------------------------------------------------------

export const aiOrgQuotaLimits = pgTable(
  "ai_org_quota_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dailyLimitUsd: numeric("daily_limit_usd", { precision: 10, scale: 2 })
      .notNull()
      .default("25.00"),
    monthlyLimitUsd: numeric("monthly_limit_usd", { precision: 10, scale: 2 })
      .notNull()
      .default("500.00"),
    warnThresholdPct: integer("warn_threshold_pct").notNull().default(80),
    highThresholdPct: integer("high_threshold_pct").notNull().default(95),
    /** Plan-tier alignment for Stage 7.B feature gating. Optional today. */
    planCode: text("plan_code"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    lastWarnSentAt: timestamp("last_warn_sent_at", { withTimezone: true }),
    lastHighWarnSentAt: timestamp("last_high_warn_sent_at", {
      withTimezone: true,
    }),
    lastBlockedAt: timestamp("last_blocked_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_org_quota_limits_org_unique").on(t.organizationId),
    index("ai_org_quota_limits_enabled_idx").on(t.isEnabled),
  ],
);

export const aiOrgUsageMonthly = pgTable(
  "ai_org_usage_monthly",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    totalRuns: integer("total_runs").notNull().default(0),
    totalPromptTokens: bigint("total_prompt_tokens", { mode: "bigint" })
      .notNull()
      .default(0n),
    totalCompletionTokens: bigint("total_completion_tokens", { mode: "bigint" })
      .notNull()
      .default(0n),
    totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 4 })
      .notNull()
      .default("0"),
    todayRuns: integer("today_runs").notNull().default(0),
    todayCostUsd: numeric("today_cost_usd", { precision: 12, scale: 4 })
      .notNull()
      .default("0"),
    todayDate: date("today_date"),
    /** Stage 7.D Stripe metered-billing sync stub. */
    stripeSyncedAt: timestamp("stripe_synced_at", { withTimezone: true }),
    stripeSubscriptionItemId: text("stripe_subscription_item_id"),
    // Stage 7.0 retrofit (migration 0086): per-dimension breakdowns
    // populated by the daily aggregate cron. Shape: { [code]: { runs, costUsd, tokens } }.
    byAgent: jsonb("by_agent").notNull().default(sql`'{}'::jsonb`),
    byProvider: jsonb("by_provider").notNull().default(sql`'{}'::jsonb`),
    byTier: jsonb("by_tier").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_org_usage_monthly_period_unique").on(
      t.organizationId,
      t.year,
      t.month,
    ),
    index("ai_org_usage_monthly_org_idx").on(t.organizationId),
    index("ai_org_usage_monthly_period_idx").on(t.year, t.month),
  ],
);

export const aiProjectMemory = pgTable(
  "ai_project_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    scopeType: text("scope_type").notNull().default("project"),
    scopeId: uuid("scope_id"),
    memoryType: text("memory_type").notNull(),
    content: text("content").notNull(),
    embeddingModel: text("embedding_model"),
    embeddingVector: text("embedding_vector"),
    isActive: boolean("is_active").notNull().default(true),
    ttlAt: timestamp("ttl_at", { withTimezone: true }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    accessCount: integer("access_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_project_memory_org_idx").on(t.organizationId),
    index("ai_project_memory_project_idx").on(t.projectId),
    index("ai_project_memory_scope_idx").on(t.scopeType, t.scopeId),
  ],
);

export type AiOrgQuotaLimit = typeof aiOrgQuotaLimits.$inferSelect;
export type NewAiOrgQuotaLimit = typeof aiOrgQuotaLimits.$inferInsert;
export type AiOrgUsageMonthlyRow = typeof aiOrgUsageMonthly.$inferSelect;
export type NewAiOrgUsageMonthlyRow = typeof aiOrgUsageMonthly.$inferInsert;
export type AiProjectMemoryRow = typeof aiProjectMemory.$inferSelect;
export type NewAiProjectMemoryRow = typeof aiProjectMemory.$inferInsert;

export type AiTranslationCacheRow = typeof aiTranslationCache.$inferSelect;
export type NewAiTranslationCacheRow = typeof aiTranslationCache.$inferInsert;
