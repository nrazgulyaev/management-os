-- Arconique Management OS — Migration 0008
-- · Background jobs: definitions, runs, run-events.
-- · Notification queue + per-user/role/template preferences.
-- Idempotent on re-run.

BEGIN;

-- =============================================================================
-- 1) job_definitions
-- =============================================================================
CREATE TABLE IF NOT EXISTS "job_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "job_type" text NOT NULL
    CHECK ("job_type" IN (
      'calendar_sync','preventive_tasks','finance_bridge','low_stock_scan',
      'cleanup','notification_digest'
    )),
  "schedule_cron" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "timeout_seconds" integer NOT NULL DEFAULT 300,
  "max_retries" integer NOT NULL DEFAULT 2,
  "config" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "job_def_enabled_idx" ON "job_definitions" ("enabled");
CREATE INDEX IF NOT EXISTS "job_def_type_idx"    ON "job_definitions" ("job_type");
DROP TRIGGER IF EXISTS trg_set_updated_at ON "job_definitions";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "job_definitions"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2) job_runs
-- =============================================================================
CREATE TABLE IF NOT EXISTS "job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_definition_id" uuid REFERENCES "job_definitions"("id") ON DELETE SET NULL,
  "job_key" text NOT NULL,
  "trigger_type" text NOT NULL
    CHECK ("trigger_type" IN ('cron','manual','system','retry')),
  "status" text NOT NULL DEFAULT 'running'
    CHECK ("status" IN ('running','success','partial_success','failed','cancelled','skipped')),
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "duration_ms" integer,
  "attempted" integer NOT NULL DEFAULT 1,
  "result_summary" text,
  "metrics" jsonb,
  "error_message" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "job_runs_key_idx"        ON "job_runs" ("job_key");
CREATE INDEX IF NOT EXISTS "job_runs_status_idx"     ON "job_runs" ("status");
CREATE INDEX IF NOT EXISTS "job_runs_started_idx"    ON "job_runs" ("started_at");
CREATE INDEX IF NOT EXISTS "job_runs_definition_idx" ON "job_runs" ("job_definition_id");

-- =============================================================================
-- 3) job_run_events — append-only log per run
-- =============================================================================
CREATE TABLE IF NOT EXISTS "job_run_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_run_id" uuid NOT NULL REFERENCES "job_runs"("id") ON DELETE CASCADE,
  "level" text NOT NULL DEFAULT 'info'
    CHECK ("level" IN ('debug','info','warning','error')),
  "message" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "job_run_events_run_idx" ON "job_run_events" ("job_run_id");
CREATE INDEX IF NOT EXISTS "job_run_events_level_idx" ON "job_run_events" ("level");

-- =============================================================================
-- 4) notification_queue
-- =============================================================================
CREATE TABLE IF NOT EXISTS "notification_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipient_type" text NOT NULL
    CHECK ("recipient_type" IN ('internal_user','owner','guest','role')),
  "recipient_id" uuid,
  "channel" text NOT NULL
    CHECK ("channel" IN ('in_app','email','whatsapp','sms','telegram')),
  "template_key" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "payload" jsonb,
  "priority" text NOT NULL DEFAULT 'normal'
    CHECK ("priority" IN ('low','normal','high','urgent')),
  "status" text NOT NULL DEFAULT 'queued'
    CHECK ("status" IN ('queued','suppressed','sent','failed','cancelled')),
  "scheduled_for" timestamptz,
  "sent_at" timestamptz,
  "failed_at" timestamptz,
  "error_message" text,
  "dedupe_key" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "nq_status_idx"   ON "notification_queue" ("status");
CREATE INDEX IF NOT EXISTS "nq_template_idx" ON "notification_queue" ("template_key");
CREATE INDEX IF NOT EXISTS "nq_channel_idx"  ON "notification_queue" ("channel");
CREATE INDEX IF NOT EXISTS "nq_recipient_idx" ON "notification_queue" ("recipient_type","recipient_id");
-- One open dedupe row at a time. NULLS NOT DISTINCT (PG15+) treats NULL = NULL,
-- but we want NULL dedupe_key to mean "no dedupe" — so use a partial index that
-- only enforces uniqueness when both dedupe_key and status are bound.
CREATE UNIQUE INDEX IF NOT EXISTS "nq_dedupe_open_unique"
  ON "notification_queue" ("dedupe_key")
  WHERE "dedupe_key" IS NOT NULL AND "status" IN ('queued','sent');

DROP TRIGGER IF EXISTS trg_set_updated_at ON "notification_queue";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "notification_queue"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 5) notification_preferences
-- =============================================================================
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "app_user_id" uuid REFERENCES "app_users"("id") ON DELETE CASCADE,
  "owner_id"   uuid REFERENCES "owners"("id")    ON DELETE CASCADE,
  "role_key" text,
  "channel" text NOT NULL
    CHECK ("channel" IN ('in_app','email','whatsapp','sms','telegram')),
  "template_key" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "quiet_hours_start" text,
  "quiet_hours_end" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "np_app_user_idx" ON "notification_preferences" ("app_user_id");
CREATE INDEX IF NOT EXISTS "np_owner_idx"    ON "notification_preferences" ("owner_id");
CREATE INDEX IF NOT EXISTS "np_role_idx"     ON "notification_preferences" ("role_key");
CREATE INDEX IF NOT EXISTS "np_template_idx" ON "notification_preferences" ("template_key");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "notification_preferences";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "notification_preferences"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 6) RLS — internal_read on every new table; mutations via server actions.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'job_definitions',
      'job_runs',
      'job_run_events',
      'notification_queue',
      'notification_preferences'
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

-- Notification preferences should let an `app_user` see their own row even
-- when not internal staff. Mirrors the access-grants self_grant_read pattern.
DROP POLICY IF EXISTS notification_prefs_self_read ON "notification_preferences";
CREATE POLICY notification_prefs_self_read ON "notification_preferences" FOR SELECT
USING (
  app_user_id IN (
    SELECT id FROM app_users WHERE auth_user_id = auth.uid() AND status = 'active'
  )
);

COMMIT;
