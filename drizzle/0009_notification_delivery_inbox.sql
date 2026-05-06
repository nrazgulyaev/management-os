-- Arconique Management OS — Migration 0009
-- · notification_deliveries — provider-side ledger (one row per attempt)
-- · in_app_notifications — durable per-user/owner inbox
-- · notification_queue — retry/attempt tracking columns
-- Idempotent on re-run.

BEGIN;

-- =============================================================================
-- 1) notification_deliveries — every send attempt across every channel
-- =============================================================================
CREATE TABLE IF NOT EXISTS "notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notification_id" uuid NOT NULL
    REFERENCES "notification_queue"("id") ON DELETE CASCADE,
  "channel" text NOT NULL
    CHECK ("channel" IN ('in_app','email','sms','whatsapp','telegram')),
  "provider" text NOT NULL DEFAULT 'in_app'
    CHECK ("provider" IN ('in_app','resend','twilio','noop')),
  "recipient_address" text,
  "status" text NOT NULL DEFAULT 'pending'
    CHECK ("status" IN ('pending','sent','failed','skipped','suppressed')),
  "provider_message_id" text,
  "attempted_at" timestamptz,
  "sent_at" timestamptz,
  "failed_at" timestamptz,
  "error_message" text,
  "response_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "nd_notification_idx" ON "notification_deliveries" ("notification_id");
CREATE INDEX IF NOT EXISTS "nd_channel_idx"      ON "notification_deliveries" ("channel");
CREATE INDEX IF NOT EXISTS "nd_status_idx"       ON "notification_deliveries" ("status");
CREATE INDEX IF NOT EXISTS "nd_attempted_idx"    ON "notification_deliveries" ("attempted_at");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "notification_deliveries";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "notification_deliveries"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2) in_app_notifications — durable per-user/owner inbox
-- =============================================================================
CREATE TABLE IF NOT EXISTS "in_app_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notification_id" uuid REFERENCES "notification_queue"("id") ON DELETE SET NULL,
  "app_user_id" uuid REFERENCES "app_users"("id") ON DELETE CASCADE,
  "owner_id"   uuid REFERENCES "owners"("id")    ON DELETE CASCADE,
  "role_key" text,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "payload" jsonb,
  "priority" text NOT NULL DEFAULT 'normal'
    CHECK ("priority" IN ('low','normal','high','urgent')),
  "status" text NOT NULL DEFAULT 'unread'
    CHECK ("status" IN ('unread','read','archived')),
  "read_at" timestamptz,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ian_app_user_idx" ON "in_app_notifications" ("app_user_id");
CREATE INDEX IF NOT EXISTS "ian_owner_idx"    ON "in_app_notifications" ("owner_id");
CREATE INDEX IF NOT EXISTS "ian_role_idx"     ON "in_app_notifications" ("role_key");
CREATE INDEX IF NOT EXISTS "ian_status_idx"   ON "in_app_notifications" ("status");
CREATE INDEX IF NOT EXISTS "ian_created_idx"  ON "in_app_notifications" ("created_at");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "in_app_notifications";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "in_app_notifications"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3) notification_queue — retry / attempt tracking
-- =============================================================================
ALTER TABLE "notification_queue"
  ADD COLUMN IF NOT EXISTS "delivery_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_attempted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "next_attempt_at"   timestamptz;

CREATE INDEX IF NOT EXISTS "nq_next_attempt_idx"
  ON "notification_queue" ("status","next_attempt_at");

-- =============================================================================
-- 3.5) job_definitions.job_type — extend the v0008 CHECK so the new
--      `notification_delivery` job type is accepted. Drop + re-add to keep
--      idempotency simple.
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
    'cleanup','notification_digest','notification_delivery'
  ));

-- =============================================================================
-- 4) RLS — internal_read on every new table; user-scoped inbox read.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['notification_deliveries','in_app_notifications'])
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

-- The signed-in app_user can read their own inbox rows (also covers
-- internal staff because they pass through is_internal_user above).
DROP POLICY IF EXISTS in_app_notifications_self_read ON "in_app_notifications";
CREATE POLICY in_app_notifications_self_read ON "in_app_notifications" FOR SELECT
USING (
  app_user_id IN (
    SELECT id FROM app_users
     WHERE auth_user_id = auth.uid() AND status = 'active'
  )
);

-- Owners may read their own owner-scoped inbox via the access-grant table.
DROP POLICY IF EXISTS in_app_notifications_owner_read ON "in_app_notifications";
CREATE POLICY in_app_notifications_owner_read ON "in_app_notifications" FOR SELECT
USING (
  owner_id IS NOT NULL
  AND owner_id IN (SELECT public.current_owner_ids())
);

-- Provider responses may carry tokens / phone numbers — never expose
-- delivery rows to non-internal callers. The default-deny on
-- notification_deliveries (internal_read only) handles that.

COMMIT;
