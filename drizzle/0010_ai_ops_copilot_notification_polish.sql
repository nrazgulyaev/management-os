-- Arconique Management OS — Migration 0010
-- · v8B notification polish: per-user timezone, retry max-attempts, templates.
-- · v8B AI Operations Co-pilot v0 — runs / tool calls / summaries (read-only).
-- · `ai_summary` job_type added so the optional refresh job can register.
-- Idempotent on re-run.

BEGIN;

-- =============================================================================
-- 1) app_users — per-user timezone for quiet-hours evaluation
-- =============================================================================
ALTER TABLE "app_users"
  ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'Asia/Makassar';

-- =============================================================================
-- 2) notification_queue — retry policy + max attempts
-- =============================================================================
ALTER TABLE "notification_queue"
  ADD COLUMN IF NOT EXISTS "max_attempts" integer NOT NULL DEFAULT 3;

-- =============================================================================
-- 3) notification_templates — channel-specific subject/body/html
-- =============================================================================
CREATE TABLE IF NOT EXISTS "notification_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "template_key" text NOT NULL,
  "channel" text NOT NULL
    CHECK ("channel" IN ('in_app','email','sms','whatsapp')),
  "subject_template" text,
  "body_template" text NOT NULL,
  "html_template" text,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_templates_key_channel_unique"
  ON "notification_templates" ("template_key","channel");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "notification_templates";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "notification_templates"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 4) ai_assistant_runs — one row per Co-pilot invocation
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ai_assistant_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assistant_key" text NOT NULL,
  "run_type" text NOT NULL DEFAULT 'manual'
    CHECK ("run_type" IN ('manual','refresh','scheduled')),
  "status" text NOT NULL DEFAULT 'running'
    CHECK ("status" IN ('running','success','failed','fallback')),
  "model" text,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "total_tokens" integer,
  "latency_ms" integer,
  "input_summary" text,
  "output_summary" text,
  "error_message" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "ai_runs_assistant_idx" ON "ai_assistant_runs" ("assistant_key");
CREATE INDEX IF NOT EXISTS "ai_runs_status_idx"    ON "ai_assistant_runs" ("status");
CREATE INDEX IF NOT EXISTS "ai_runs_created_idx"   ON "ai_assistant_runs" ("created_at");

-- =============================================================================
-- 5) ai_assistant_tool_calls — append-only audit of every tool invocation
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ai_assistant_tool_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "ai_assistant_runs"("id") ON DELETE CASCADE,
  "tool_name" text NOT NULL,
  "input_json" jsonb,
  "output_summary" text,
  "status" text NOT NULL DEFAULT 'success'
    CHECK ("status" IN ('success','failed','blocked')),
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_tool_calls_run_idx"  ON "ai_assistant_tool_calls" ("run_id");
CREATE INDEX IF NOT EXISTS "ai_tool_calls_tool_idx" ON "ai_assistant_tool_calls" ("tool_name");
CREATE INDEX IF NOT EXISTS "ai_tool_calls_status_idx" ON "ai_assistant_tool_calls" ("status");

-- =============================================================================
-- 6) ai_operations_summaries — latest deterministic / Co-pilot summaries
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ai_operations_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid REFERENCES "ai_assistant_runs"("id") ON DELETE SET NULL,
  "summary_date" date NOT NULL DEFAULT current_date,
  "title" text NOT NULL,
  "executive_summary" text NOT NULL,
  "risk_level" text NOT NULL DEFAULT 'normal'
    CHECK ("risk_level" IN ('normal','elevated','high','critical')),
  "highlights" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "risks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "recommended_actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "source_snapshot" jsonb,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','archived')),
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_ops_summaries_date_idx"    ON "ai_operations_summaries" ("summary_date");
CREATE INDEX IF NOT EXISTS "ai_ops_summaries_status_idx"  ON "ai_operations_summaries" ("status");
CREATE INDEX IF NOT EXISTS "ai_ops_summaries_created_idx" ON "ai_operations_summaries" ("created_at");

-- =============================================================================
-- 7) job_definitions.job_type — accept the new `ai_summary` value so the
--    optional refresh job can be installed.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'job_definitions_job_type_check'
  ) THEN
    ALTER TABLE "job_definitions"
      DROP CONSTRAINT job_definitions_job_type_check;
  END IF;
END $$;

ALTER TABLE "job_definitions"
  ADD CONSTRAINT job_definitions_job_type_check
  CHECK ("job_type" IN (
    'calendar_sync','preventive_tasks','finance_bridge','low_stock_scan',
    'cleanup','notification_digest','notification_delivery','ai_summary'
  ));

-- =============================================================================
-- 8) RLS — every new table is internal-only.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'notification_templates',
      'ai_assistant_runs',
      'ai_assistant_tool_calls',
      'ai_operations_summaries'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_read ON %I; '
      'CREATE POLICY internal_read ON %I FOR SELECT '
      'USING (public.is_internal_user());',
      t, t
    );
  END LOOP;
END $$;

-- AI v0 is internal-only. Owners/guests never see runs, tool calls, or
-- the operations summary — keep the default-deny stance from RLS.

COMMIT;
