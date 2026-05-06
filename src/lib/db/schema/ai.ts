import {
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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";

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

export type AiTranslationCacheRow = typeof aiTranslationCache.$inferSelect;
export type NewAiTranslationCacheRow = typeof aiTranslationCache.$inferInsert;
