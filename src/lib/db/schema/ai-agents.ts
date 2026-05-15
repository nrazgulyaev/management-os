/**
 * Stage 5.D — Project-Aware AI Memory + Specialized Agents.
 *
 * 4 tables:
 *   - project_ai_memory      shared knowledge across all 12 agents
 *   - agent_invocation_log   per-call audit + cost trail
 *   - agent_configurations   prompts, budget caps, rate limits
 *   - agent_outputs          polymorphic output + operator review
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  bigint,
  integer,
  numeric,
  boolean,
  jsonb,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const projectAiMemory = pgTable(
  "project_ai_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    memoryType: text("memory_type").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    detail: text("detail"),
    sourceType: text("source_type").notNull(),
    sourceEntityType: text("source_entity_type"),
    sourceEntityId: uuid("source_entity_id"),
    confidenceLevel: text("confidence_level"),
    observedCount: integer("observed_count").notNull().default(1),
    lastObservedAt: date("last_observed_at"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    relatedEntityIds: uuid("related_entity_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    isActive: boolean("is_active").notNull().default(true),
    supersededBy: uuid("superseded_by").references(
      (): AnyPgColumn => projectAiMemory.id,
    ),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archiveReason: text("archive_reason"),
    embeddingVector: numeric("embedding_vector").array(),
    createdBy: uuid("created_by").references(() => appUsers.id),
    aiGeneratedByAgent: text("ai_generated_by_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("project_ai_memory_project_idx").on(t.projectId),
    index("project_ai_memory_type_idx").on(t.memoryType),
    index("project_ai_memory_observed_idx").on(t.lastObservedAt),
  ],
);

export const agentInvocationLog = pgTable(
  "agent_invocation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072. Declared
    // nullable in TS to avoid breaking out-of-scope insert callsites
    // (e.g. agent-runner.ts) not yet migrated to pass it.
    organizationId: uuid("organization_id").references(() => organizations.id),
    agentKey: text("agent_key").notNull(),
    agentVersion: text("agent_version").notNull().default("v1.0"),
    invocationType: text("invocation_type").notNull(),
    triggeredByUserId: uuid("triggered_by_user_id").references(
      () => appUsers.id,
    ),
    triggeredByEvent: text("triggered_by_event"),
    projectId: uuid("project_id").references(() => projects.id),
    scopeEntityType: text("scope_entity_type"),
    scopeEntityId: uuid("scope_entity_id"),
    memoryItemsLoaded: integer("memory_items_loaded").notNull().default(0),
    memoryIdsUsed: uuid("memory_ids_used")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    providerUsed: text("provider_used").notNull(),
    modelUsed: text("model_used"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costMinor: bigint("cost_minor", { mode: "bigint" }),
    costCurrency: text("cost_currency").default("USD"),
    invokedAt: timestamp("invoked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    outputSummary: text("output_summary"),
    outputFull: jsonb("output_full"),
    outputEntityId: uuid("output_entity_id"),
    operatorReviewStatus: text("operator_review_status"),
    operatorReviewedBy: uuid("operator_reviewed_by").references(
      () => appUsers.id,
    ),
    operatorReviewedAt: timestamp("operator_reviewed_at", { withTimezone: true }),
    operatorFeedback: text("operator_feedback"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_invocation_log_agent_idx").on(t.agentKey),
    index("agent_invocation_log_project_idx").on(t.projectId),
    index("agent_invocation_log_status_idx").on(t.status),
    index("agent_invocation_log_review_idx").on(t.operatorReviewStatus),
    index("agent_invocation_log_invoked_idx").on(t.invokedAt),
  ],
);

export const agentConfigurations = pgTable(
  "agent_configurations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentKey: text("agent_key").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    agentType: text("agent_type").notNull(),
    preferredProvider: text("preferred_provider").notNull().default("anthropic"),
    preferredModel: text("preferred_model"),
    fallbackProvider: text("fallback_provider"),
    systemPrompt: text("system_prompt").notNull(),
    userPromptTemplate: text("user_prompt_template").notNull(),
    expectedOutputSchema: jsonb("expected_output_schema"),
    dailyBudgetMinor: bigint("daily_budget_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    monthlyBudgetMinor: bigint("monthly_budget_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    perInvocationBudgetMinor: bigint("per_invocation_budget_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    budgetCurrency: text("budget_currency").notNull().default("USD"),
    maxInvocationsPerHour: integer("max_invocations_per_hour"),
    maxInvocationsPerDay: integer("max_invocations_per_day"),
    requiresOperatorReview: boolean("requires_operator_review")
      .notNull()
      .default(true),
    operatorReviewThresholdMinor: bigint("operator_review_threshold_minor", {
      mode: "bigint",
    }),
    usesMemory: boolean("uses_memory").notNull().default(true),
    memoryTypesRelevant: text("memory_types_relevant")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    maxMemoryItemsLoaded: integer("max_memory_items_loaded")
      .notNull()
      .default(20),
    isActive: boolean("is_active").notNull().default(true),
    enabledInDryRun: boolean("enabled_in_dry_run").notNull().default(true),
    promptVersion: text("prompt_version").notNull().default("v1.0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_configurations_active_idx").on(t.isActive),
    index("agent_configurations_type_idx").on(t.agentType),
  ],
);

export const agentOutputs = pgTable(
  "agent_outputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072. Declared
    // nullable in TS to avoid breaking out-of-scope insert callsites
    // (e.g. agent-runner.ts, run-agent-action.ts) not yet migrated.
    organizationId: uuid("organization_id").references(() => organizations.id),
    outputCode: text("output_code").notNull().unique(),
    agentKey: text("agent_key").notNull(),
    invocationLogId: uuid("invocation_log_id").references(
      () => agentInvocationLog.id,
    ),
    projectId: uuid("project_id").references(() => projects.id),
    scopeEntityType: text("scope_entity_type"),
    scopeEntityId: uuid("scope_entity_id"),
    outputCategory: text("output_category").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    detailedOutput: jsonb("detailed_output").notNull(),
    recommendedActions: text("recommended_actions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    affectedEntities: jsonb("affected_entities"),
    confidenceLevel: text("confidence_level"),
    reasoningSummary: text("reasoning_summary"),
    status: text("status").notNull().default("awaiting_review"),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerNotes: text("reviewer_notes"),
    editedSummary: text("edited_summary"),
    editedActions: text("edited_actions").array(),
    actionsExecuted: boolean("actions_executed").notNull().default(false),
    actionsExecutedAt: timestamp("actions_executed_at", { withTimezone: true }),
    actionsExecutedBy: uuid("actions_executed_by").references(
      () => appUsers.id,
    ),
    actionResults: jsonb("action_results"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_outputs_agent_idx").on(t.agentKey),
    index("agent_outputs_status_idx").on(t.status),
    index("agent_outputs_project_idx").on(t.projectId),
    index("agent_outputs_created_idx").on(t.createdAt),
  ],
);

export type ProjectAiMemory = typeof projectAiMemory.$inferSelect;
export type NewProjectAiMemory = typeof projectAiMemory.$inferInsert;
export type AgentInvocationLog = typeof agentInvocationLog.$inferSelect;
export type NewAgentInvocationLog = typeof agentInvocationLog.$inferInsert;
export type AgentConfiguration = typeof agentConfigurations.$inferSelect;
export type NewAgentConfiguration = typeof agentConfigurations.$inferInsert;
export type AgentOutput = typeof agentOutputs.$inferSelect;
export type NewAgentOutput = typeof agentOutputs.$inferInsert;
