-- =============================================================================
-- 0065 — Development OS · Stage 5.E.3 — Sales conversation review
--
-- 2 new tables:
--   - sales_conversation_threads    aggregated conversation threads
--   - manager_performance_metrics   per-manager periodic snapshots
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) sales_conversation_threads
-- =============================================================================

CREATE TABLE IF NOT EXISTS "sales_conversation_threads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "thread_code" TEXT UNIQUE NOT NULL,

  "lead_id" UUID REFERENCES "leads"("id"),
  "buyer_id" UUID REFERENCES "buyers"("id"),

  "primary_sales_manager_id" UUID REFERENCES "app_users"("id"),

  "channel_types" TEXT[] NOT NULL DEFAULT '{}',

  "conversation_start_at" TIMESTAMPTZ NOT NULL,
  "last_message_at" TIMESTAMPTZ NOT NULL,
  "total_message_count" INTEGER NOT NULL DEFAULT 0,

  "outcome" TEXT CHECK ("outcome" IN (
    'reservation', 'contract_signed', 'lost_no_response',
    'lost_competitor', 'lost_price', 'lost_other',
    'still_active', 'on_hold'
  )),
  "outcome_recorded_at" TIMESTAMPTZ,

  "ai_analysis_status" TEXT NOT NULL DEFAULT 'not_analyzed' CHECK ("ai_analysis_status" IN (
    'not_analyzed', 'analyzing', 'analyzed', 'analysis_failed'
  )),
  "ai_analysis_output_id" UUID REFERENCES "agent_outputs"("id"),

  "consent_to_analyze" BOOLEAN NOT NULL DEFAULT FALSE,
  "consent_recorded_at" TIMESTAMPTZ,
  "consent_recorded_by" UUID REFERENCES "app_users"("id"),

  "notes" TEXT,
  "internal_notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_conversation_threads_lead_idx"
  ON "sales_conversation_threads"("lead_id");
CREATE INDEX IF NOT EXISTS "sales_conversation_threads_manager_idx"
  ON "sales_conversation_threads"("primary_sales_manager_id");
CREATE INDEX IF NOT EXISTS "sales_conversation_threads_outcome_idx"
  ON "sales_conversation_threads"("outcome");
CREATE INDEX IF NOT EXISTS "sales_conversation_threads_period_idx"
  ON "sales_conversation_threads"("conversation_start_at" DESC);

CREATE OR REPLACE FUNCTION "sales_conversation_threads_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_sales_conversation_threads_updated_at"
  ON "sales_conversation_threads";
CREATE TRIGGER "trg_sales_conversation_threads_updated_at"
  BEFORE UPDATE ON "sales_conversation_threads"
  FOR EACH ROW EXECUTE FUNCTION "sales_conversation_threads_set_updated_at"();


-- =============================================================================
-- 2) manager_performance_metrics
-- =============================================================================

CREATE TABLE IF NOT EXISTS "manager_performance_metrics" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "manager_id" UUID NOT NULL REFERENCES "app_users"("id"),

  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "period_type" TEXT NOT NULL CHECK ("period_type" IN ('weekly', 'monthly', 'quarterly')),

  "total_leads_assigned" INTEGER NOT NULL DEFAULT 0,
  "total_conversations_active" INTEGER NOT NULL DEFAULT 0,
  "total_messages_sent" INTEGER NOT NULL DEFAULT 0,
  "total_calls_made" INTEGER NOT NULL DEFAULT 0,

  "average_response_time_minutes" NUMERIC(10,2),
  "median_response_time_minutes" NUMERIC(10,2),
  "longest_response_time_hours" NUMERIC(10,2),

  "reservations_secured" INTEGER NOT NULL DEFAULT 0,
  "contracts_signed" INTEGER NOT NULL DEFAULT 0,
  "leads_lost" INTEGER NOT NULL DEFAULT 0,

  "lead_to_reservation_rate" NUMERIC(5,2),
  "reservation_to_contract_rate" NUMERIC(5,2),

  "missed_followups_count" INTEGER NOT NULL DEFAULT 0,
  "unresponded_messages_count" INTEGER NOT NULL DEFAULT 0,

  "flagged_conversations_count" INTEGER NOT NULL DEFAULT 0,
  "ai_quality_score" NUMERIC(5,2),

  "computed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("manager_id", "period_start", "period_end", "period_type"),
  CHECK ("period_end" >= "period_start")
);

CREATE INDEX IF NOT EXISTS "manager_performance_metrics_manager_idx"
  ON "manager_performance_metrics"("manager_id");
CREATE INDEX IF NOT EXISTS "manager_performance_metrics_period_idx"
  ON "manager_performance_metrics"("period_start", "period_end");


-- =============================================================================
-- 3) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['sales_conversation_threads', 'manager_performance_metrics'])
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
