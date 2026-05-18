-- =============================================================================
-- 0109 — AGENT-FOUNDATION (P5.1.1)
--
-- Platform-managed AI agent infrastructure. Super_admin centrally defines
-- agents (provider/model/system prompt/knowledge base); customer orgs
-- subscribe to enabled agents via org_agent_subscriptions; users chat
-- with subscribed agents.
--
-- 7 new tables + pgvector extension:
--   1. platform_agent_configs        super_admin-managed agent definitions
--   2. org_agent_subscriptions       per-org enable / overrides
--   3. agent_knowledge_documents     uploaded source docs per agent
--   4. agent_knowledge_chunks        chunked + embedded text (pgvector)
--   5. agent_threads                 per-user conversation containers
--   6. agent_messages                individual chat messages
--   7. agent_runs                    telemetry / cost tracking
--
-- Layering decision (Option B from spec): build new tables alongside the
-- existing `org_ai_agent_config` + `ai_assistant_runs` rather than
-- migrating those. Existing tables stay live; new agent surfaces use
-- this foundation. Deprecation of the old tables lands when the new
-- system is operating production traffic.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- 0) Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- 1) platform_agent_configs
-- =============================================================================

CREATE TABLE IF NOT EXISTS "platform_agent_configs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_code" TEXT NOT NULL UNIQUE,
  "display_name" TEXT NOT NULL,
  "description" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'global'
    CHECK ("scope" IN ('global', 'organization')),
  "provider" TEXT NOT NULL
    CHECK ("provider" IN ('openai', 'anthropic', 'google')),
  "model" TEXT NOT NULL,
  "system_prompt" TEXT NOT NULL DEFAULT '',
  -- Vault secret reference (never the raw key). NULL = use system env.
  "vault_secret_name" TEXT,
  "temperature" NUMERIC(3, 2) NOT NULL DEFAULT 0.70,
  "max_tokens" INTEGER NOT NULL DEFAULT 2000,
  -- Default budget: $50/month (5000 cents).
  "budget_monthly_usd_minor" INTEGER NOT NULL DEFAULT 5000,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "platform_agent_configs_provider_model_idx"
  ON "platform_agent_configs" ("provider", "model");
CREATE INDEX IF NOT EXISTS "platform_agent_configs_active_idx"
  ON "platform_agent_configs" ("is_active") WHERE "is_active" = TRUE;

-- =============================================================================
-- 2) org_agent_subscriptions
-- =============================================================================

CREATE TABLE IF NOT EXISTS "org_agent_subscriptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "agent_id" UUID NOT NULL REFERENCES "platform_agent_configs"("id") ON DELETE CASCADE,
  "is_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  -- Optional org-level overrides over the platform defaults.
  "custom_system_prompt" TEXT,
  "custom_budget_usd_minor" INTEGER,
  "enabled_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "org_agent_subscriptions_unique"
    UNIQUE ("organization_id", "agent_id")
);

CREATE INDEX IF NOT EXISTS "org_agent_subscriptions_org_idx"
  ON "org_agent_subscriptions" ("organization_id");
CREATE INDEX IF NOT EXISTS "org_agent_subscriptions_agent_idx"
  ON "org_agent_subscriptions" ("agent_id");

-- =============================================================================
-- 3) agent_knowledge_documents
-- =============================================================================

CREATE TABLE IF NOT EXISTS "agent_knowledge_documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" UUID NOT NULL REFERENCES "platform_agent_configs"("id") ON DELETE CASCADE,
  -- NULL = platform-global knowledge available to every subscribed org.
  -- Non-NULL = org-specific knowledge only that org's users retrieve.
  "organization_id" UUID REFERENCES "organizations"("id") ON DELETE CASCADE,
  "storage_path" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "chunk_count" INTEGER NOT NULL DEFAULT 0,
  "processing_status" TEXT NOT NULL DEFAULT 'pending'
    CHECK ("processing_status" IN
      ('pending', 'chunking', 'embedding', 'ready', 'failed')),
  "processing_error" TEXT,
  "uploaded_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processed_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "agent_knowledge_documents_agent_idx"
  ON "agent_knowledge_documents" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_knowledge_documents_org_idx"
  ON "agent_knowledge_documents" ("organization_id")
  WHERE "organization_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "agent_knowledge_documents_status_idx"
  ON "agent_knowledge_documents" ("processing_status")
  WHERE "processing_status" != 'ready';

-- =============================================================================
-- 4) agent_knowledge_chunks (pgvector)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "agent_knowledge_chunks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL REFERENCES "agent_knowledge_documents"("id") ON DELETE CASCADE,
  -- Denormalized for query-time filtering speed.
  "agent_id" UUID NOT NULL REFERENCES "platform_agent_configs"("id") ON DELETE CASCADE,
  "organization_id" UUID REFERENCES "organizations"("id") ON DELETE CASCADE,
  "chunk_index" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(1536),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_knowledge_chunks_document_idx"
  ON "agent_knowledge_chunks" ("document_id");
CREATE INDEX IF NOT EXISTS "agent_knowledge_chunks_agent_org_idx"
  ON "agent_knowledge_chunks" ("agent_id", "organization_id");

-- HNSW index for fast cosine similarity retrieval. Requires pgvector
-- >= 0.5.0; Supabase ships a recent version. Falls back to seq scan
-- gracefully if the index can't be built.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'agent_knowledge_chunks_embedding_hnsw_idx'
  ) THEN
    BEGIN
      EXECUTE 'CREATE INDEX agent_knowledge_chunks_embedding_hnsw_idx
                 ON agent_knowledge_chunks
                 USING hnsw (embedding vector_cosine_ops)';
    EXCEPTION WHEN OTHERS THEN
      -- HNSW unsupported; IVFFlat fallback. Build lists=100 (rule of
      -- thumb: rows/1000 with min 1, max 1000). Re-tune as data grows.
      EXECUTE 'CREATE INDEX agent_knowledge_chunks_embedding_ivfflat_idx
                 ON agent_knowledge_chunks
                 USING ivfflat (embedding vector_cosine_ops)
                 WITH (lists = 100)';
    END;
  END IF;
END $$;

-- =============================================================================
-- 5) agent_threads
-- =============================================================================

CREATE TABLE IF NOT EXISTS "agent_threads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" UUID NOT NULL REFERENCES "platform_agent_configs"("id") ON DELETE CASCADE,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "title" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_threads_user_idx"
  ON "agent_threads" ("user_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "agent_threads_agent_org_idx"
  ON "agent_threads" ("agent_id", "organization_id");

-- =============================================================================
-- 6) agent_messages
-- =============================================================================

CREATE TABLE IF NOT EXISTS "agent_messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "thread_id" UUID NOT NULL REFERENCES "agent_threads"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL CHECK ("role" IN ('user', 'assistant', 'system')),
  "content" TEXT NOT NULL,
  "tokens_in" INTEGER,
  "tokens_out" INTEGER,
  "cost_usd_minor" INTEGER,
  -- Audit trail: which retrieved chunks shaped the response. Lets the
  -- UI render citations and lets us evaluate retrieval quality offline.
  "retrieved_chunk_ids" UUID[],
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_messages_thread_idx"
  ON "agent_messages" ("thread_id", "created_at");

-- =============================================================================
-- 7) agent_runs (telemetry)
-- =============================================================================
--
-- Parallel to the legacy ai_assistant_runs table. New surface; new
-- table aligned with the new architecture. Deprecation of the old
-- table waits until the new system carries production traffic.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" UUID NOT NULL REFERENCES "platform_agent_configs"("id") ON DELETE CASCADE,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "thread_id" UUID REFERENCES "agent_threads"("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL DEFAULT 'success'
    CHECK ("status" IN
      ('success', 'error', 'budget_exceeded', 'rate_limited', 'in_progress')),
  "tokens_in" INTEGER NOT NULL DEFAULT 0,
  "tokens_out" INTEGER NOT NULL DEFAULT 0,
  "cost_usd_minor" INTEGER NOT NULL DEFAULT 0,
  "latency_ms" INTEGER,
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "agent_runs_agent_started_idx"
  ON "agent_runs" ("agent_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "agent_runs_org_started_idx"
  ON "agent_runs" ("organization_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "agent_runs_status_idx"
  ON "agent_runs" ("status") WHERE "status" != 'success';

-- =============================================================================
-- updated_at triggers (mirror app_user_roles pattern from 0066)
-- =============================================================================

CREATE OR REPLACE FUNCTION "agents_set_updated_at"() RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_platform_agent_configs_updated_at" ON "platform_agent_configs";
CREATE TRIGGER "trg_platform_agent_configs_updated_at"
  BEFORE UPDATE ON "platform_agent_configs"
  FOR EACH ROW EXECUTE FUNCTION "agents_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_org_agent_subscriptions_updated_at" ON "org_agent_subscriptions";
CREATE TRIGGER "trg_org_agent_subscriptions_updated_at"
  BEFORE UPDATE ON "org_agent_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "agents_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_agent_threads_updated_at" ON "agent_threads";
CREATE TRIGGER "trg_agent_threads_updated_at"
  BEFORE UPDATE ON "agent_threads"
  FOR EACH ROW EXECUTE FUNCTION "agents_set_updated_at"();

COMMIT;
