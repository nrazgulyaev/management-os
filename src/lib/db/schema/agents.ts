/**
 * P5.1.2 AGENT-SCHEMA-DRIZZLE — TypeScript schema for the agent foundation
 * tables introduced in migration 0109_agent_foundation.sql.
 *
 * Layering note: this is a NEW parallel system. It does NOT replace the
 * existing `org_ai_agent_config` (Stage 9.F.1) or `ai_assistant_runs`
 * (Stage 3.A). Those continue to drive the legacy AI Hub. The new
 * platform-managed agent system layered on top will eventually
 * deprecate the legacy tables once it carries production traffic.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  jsonb,
  index,
  unique,
  customType,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";

/**
 * pgvector(1536) custom Drizzle type. The runtime representation in JS
 * is `number[]` (the array of floats that the embedding model returns).
 * Persists as Postgres `vector(1536)` so the HNSW / IVFFlat indexes
 * from migration 0109 work transparently.
 */
const vector1536 = customType<{
  data: number[];
  driverData: string;
}>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns "[0.1,0.2,...]" — strip brackets, split.
    const stripped = value.replace(/^\[/, "").replace(/\]$/, "");
    if (!stripped) return [];
    return stripped.split(",").map(Number);
  },
});

// -----------------------------------------------------------------------------
// 1) platform_agent_configs — super_admin-managed agent definitions
// -----------------------------------------------------------------------------

export const platformAgentConfigs = pgTable(
  "platform_agent_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentCode: text("agent_code").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    /** 'global' | 'organization' */
    scope: text("scope").notNull().default("global"),
    /** 'openai' | 'anthropic' | 'google' */
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    systemPrompt: text("system_prompt").notNull().default(""),
    /** Supabase Vault secret reference. NULL = fallback to env var. */
    vaultSecretName: text("vault_secret_name"),
    temperature: numeric("temperature", { precision: 3, scale: 2 })
      .notNull()
      .default("0.70"),
    maxTokens: integer("max_tokens").notNull().default(2000),
    /** Monthly budget cap in USD cents (5000 = $50). */
    budgetMonthlyUsdMinor: integer("budget_monthly_usd_minor")
      .notNull()
      .default(5000),
    isActive: boolean("is_active").notNull().default(true),
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
    index("platform_agent_configs_provider_model_idx").on(t.provider, t.model),
    index("platform_agent_configs_active_idx").on(t.isActive),
  ],
);

// -----------------------------------------------------------------------------
// 2) org_agent_subscriptions — per-org enablement + overrides
// -----------------------------------------------------------------------------

export const orgAgentSubscriptions = pgTable(
  "org_agent_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => platformAgentConfigs.id, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    customSystemPrompt: text("custom_system_prompt"),
    customBudgetUsdMinor: integer("custom_budget_usd_minor"),
    enabledAt: timestamp("enabled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("org_agent_subscriptions_unique").on(t.organizationId, t.agentId),
    index("org_agent_subscriptions_org_idx").on(t.organizationId),
    index("org_agent_subscriptions_agent_idx").on(t.agentId),
  ],
);

// -----------------------------------------------------------------------------
// 3) agent_knowledge_documents — source docs per agent
// -----------------------------------------------------------------------------

export const agentKnowledgeDocuments = pgTable(
  "agent_knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => platformAgentConfigs.id, { onDelete: "cascade" }),
    /** NULL = platform-global doc, accessible to every subscribed org. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    storagePath: text("storage_path").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    chunkCount: integer("chunk_count").notNull().default(0),
    /** 'pending' | 'chunking' | 'embedding' | 'ready' | 'failed' */
    processingStatus: text("processing_status").notNull().default("pending"),
    processingError: text("processing_error"),
    uploadedBy: uuid("uploaded_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("agent_knowledge_documents_agent_idx").on(t.agentId),
    index("agent_knowledge_documents_org_idx").on(t.organizationId),
    index("agent_knowledge_documents_status_idx").on(t.processingStatus),
  ],
);

// -----------------------------------------------------------------------------
// 4) agent_knowledge_chunks — chunked text + pgvector embeddings
// -----------------------------------------------------------------------------

export const agentKnowledgeChunks = pgTable(
  "agent_knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => agentKnowledgeDocuments.id, { onDelete: "cascade" }),
    /** Denormalized from documents for retrieval-time filtering speed. */
    agentId: uuid("agent_id")
      .notNull()
      .references(() => platformAgentConfigs.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector1536("embedding"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_knowledge_chunks_document_idx").on(t.documentId),
    index("agent_knowledge_chunks_agent_org_idx").on(
      t.agentId,
      t.organizationId,
    ),
    // HNSW / IVFFlat index defined in 0109 migration — Drizzle can't
    // declare those directly, but the DB has them.
  ],
);

// -----------------------------------------------------------------------------
// 5) agent_threads — conversation containers
// -----------------------------------------------------------------------------

export const agentThreads = pgTable(
  "agent_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => platformAgentConfigs.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_threads_user_idx").on(t.userId, t.updatedAt),
    index("agent_threads_agent_org_idx").on(t.agentId, t.organizationId),
  ],
);

// -----------------------------------------------------------------------------
// 6) agent_messages — individual chat messages
// -----------------------------------------------------------------------------

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => agentThreads.id, { onDelete: "cascade" }),
    /** 'user' | 'assistant' | 'system' */
    role: text("role").notNull(),
    content: text("content").notNull(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsdMinor: integer("cost_usd_minor"),
    /** UUID array — chunks retrieved for this turn's RAG context. */
    retrievedChunkIds: uuid("retrieved_chunk_ids").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("agent_messages_thread_idx").on(t.threadId, t.createdAt)],
);

// -----------------------------------------------------------------------------
// 7) agent_runs — per-invocation telemetry + cost
// -----------------------------------------------------------------------------

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => platformAgentConfigs.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    threadId: uuid("thread_id").references(() => agentThreads.id, {
      onDelete: "set null",
    }),
    /** 'success' | 'error' | 'budget_exceeded' | 'rate_limited' | 'in_progress' */
    status: text("status").notNull().default("success"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsdMinor: integer("cost_usd_minor").notNull().default(0),
    latencyMs: integer("latency_ms"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("agent_runs_agent_started_idx").on(t.agentId, t.startedAt),
    index("agent_runs_org_started_idx").on(t.organizationId, t.startedAt),
    index("agent_runs_status_idx").on(t.status),
  ],
);

// -----------------------------------------------------------------------------
// Type exports
// -----------------------------------------------------------------------------

export type PlatformAgentConfig = typeof platformAgentConfigs.$inferSelect;
export type NewPlatformAgentConfig = typeof platformAgentConfigs.$inferInsert;
export type OrgAgentSubscription = typeof orgAgentSubscriptions.$inferSelect;
export type AgentKnowledgeDocument = typeof agentKnowledgeDocuments.$inferSelect;
export type AgentKnowledgeChunk = typeof agentKnowledgeChunks.$inferSelect;
export type AgentThread = typeof agentThreads.$inferSelect;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
