-- =============================================================================
-- 0061 — Development OS · Stage 5.D.1 — Project-Aware AI Memory
--
-- 2 new tables:
--   - project_ai_memory       persistent project knowledge accessible by all agents
--   - agent_invocation_log    audit + cost trail of every AI agent invocation
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) project_ai_memory
-- =============================================================================

CREATE TABLE IF NOT EXISTS "project_ai_memory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "project_id" UUID NOT NULL REFERENCES "projects"("id"),

  "memory_type" TEXT NOT NULL CHECK ("memory_type" IN (
    'decision_summary',
    'supplier_pattern',
    'cost_pattern',
    'schedule_pattern',
    'team_observation',
    'risk_observation',
    'communication_pattern',
    'product_specification',
    'site_condition',
    'regulatory_note',
    'design_evolution',
    'quality_observation',
    'general_lesson_learned'
  )),

  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "detail" TEXT,

  "source_type" TEXT NOT NULL CHECK ("source_type" IN (
    'manual_entry',
    'ai_generated',
    'auto_aggregated',
    'imported_from_decision_log',
    'imported_from_risk_register'
  )),
  "source_entity_type" TEXT,
  "source_entity_id" UUID,

  "confidence_level" TEXT CHECK ("confidence_level" IN ('low', 'medium', 'high')),
  "observed_count" INTEGER NOT NULL DEFAULT 1,
  "last_observed_at" DATE,

  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "related_entity_ids" UUID[] NOT NULL DEFAULT '{}',

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "superseded_by" UUID REFERENCES "project_ai_memory"("id"),
  "archived_at" TIMESTAMPTZ,
  "archive_reason" TEXT,

  "embedding_vector" NUMERIC[],

  "created_by" UUID REFERENCES "app_users"("id"),
  "ai_generated_by_agent" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "project_ai_memory_project_idx"
  ON "project_ai_memory"("project_id");
CREATE INDEX IF NOT EXISTS "project_ai_memory_type_idx"
  ON "project_ai_memory"("memory_type");
CREATE INDEX IF NOT EXISTS "project_ai_memory_active_idx"
  ON "project_ai_memory"("is_active") WHERE "is_active" = TRUE;
CREATE INDEX IF NOT EXISTS "project_ai_memory_tags_gin_idx"
  ON "project_ai_memory" USING GIN ("tags");
CREATE INDEX IF NOT EXISTS "project_ai_memory_observed_idx"
  ON "project_ai_memory"("last_observed_at" DESC);

CREATE OR REPLACE FUNCTION "project_ai_memory_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_project_ai_memory_updated_at" ON "project_ai_memory";
CREATE TRIGGER "trg_project_ai_memory_updated_at"
  BEFORE UPDATE ON "project_ai_memory"
  FOR EACH ROW EXECUTE FUNCTION "project_ai_memory_set_updated_at"();


-- =============================================================================
-- 2) agent_invocation_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS "agent_invocation_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "agent_key" TEXT NOT NULL,
  "agent_version" TEXT NOT NULL DEFAULT 'v1.0',

  "invocation_type" TEXT NOT NULL CHECK ("invocation_type" IN (
    'user_triggered', 'cron_recurring', 'event_triggered', 'webhook_triggered'
  )),
  "triggered_by_user_id" UUID REFERENCES "app_users"("id"),
  "triggered_by_event" TEXT,

  "project_id" UUID REFERENCES "projects"("id"),
  "scope_entity_type" TEXT,
  "scope_entity_id" UUID,

  "memory_items_loaded" INTEGER NOT NULL DEFAULT 0,
  "memory_ids_used" UUID[] NOT NULL DEFAULT '{}',

  "provider_used" TEXT NOT NULL,
  "model_used" TEXT,

  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "cost_minor" BIGINT,
  "cost_currency" TEXT DEFAULT 'USD',

  "invoked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ,
  "duration_ms" INTEGER,

  "status" TEXT NOT NULL CHECK ("status" IN (
    'pending', 'completed', 'failed', 'rejected_by_operator',
    'rate_limited', 'budget_exceeded', 'dry_run'
  )),
  "error_message" TEXT,

  "output_summary" TEXT,
  "output_full" JSONB,
  "output_entity_id" UUID,

  "operator_review_status" TEXT CHECK ("operator_review_status" IN (
    'awaiting_review', 'approved', 'rejected', 'edited_and_approved', 'no_review_needed'
  )),
  "operator_reviewed_by" UUID REFERENCES "app_users"("id"),
  "operator_reviewed_at" TIMESTAMPTZ,
  "operator_feedback" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_invocation_log_agent_idx"
  ON "agent_invocation_log"("agent_key");
CREATE INDEX IF NOT EXISTS "agent_invocation_log_project_idx"
  ON "agent_invocation_log"("project_id");
CREATE INDEX IF NOT EXISTS "agent_invocation_log_status_idx"
  ON "agent_invocation_log"("status");
CREATE INDEX IF NOT EXISTS "agent_invocation_log_review_idx"
  ON "agent_invocation_log"("operator_review_status");
CREATE INDEX IF NOT EXISTS "agent_invocation_log_invoked_idx"
  ON "agent_invocation_log"("invoked_at" DESC);


-- =============================================================================
-- 3) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['project_ai_memory', 'agent_invocation_log'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_read ON %I; '
      'CREATE POLICY internal_read ON %I FOR SELECT '
      'USING (public.is_internal_user());',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_write ON %I; '
      'CREATE POLICY internal_write ON %I FOR ALL '
      'USING (public.is_internal_user()) '
      'WITH CHECK (public.is_internal_user());',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
