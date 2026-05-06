-- =============================================================================
-- 0070 — Development OS · Stage 5.I — Mobile + Offline (PWA)
--
-- 3 new tables:
--   - push_subscriptions          per-user / per-device push endpoints
--   - notification_dispatch_log   one row per dispatched push notification
--   - offline_action_queue        server-side audit log of synced offline actions
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) push_subscriptions
-- =============================================================================

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,

  "endpoint" TEXT NOT NULL UNIQUE,
  "p256dh_key" TEXT NOT NULL,
  "auth_key" TEXT NOT NULL,

  "device_label" TEXT,
  "user_agent" TEXT,
  "device_type" TEXT CHECK ("device_type" IN ('mobile', 'tablet', 'desktop', 'unknown')),

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,

  "enabled_notification_types" TEXT[] NOT NULL DEFAULT '{}',

  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "last_successful_delivery_at" TIMESTAMPTZ,
  "last_failure_at" TIMESTAMPTZ,
  "last_failure_reason" TEXT,

  "subscribed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "unsubscribed_at" TIMESTAMPTZ,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions"("user_id");
CREATE INDEX IF NOT EXISTS "push_subscriptions_active_idx"
  ON "push_subscriptions"("is_active") WHERE "is_active" = TRUE;

CREATE OR REPLACE FUNCTION "push_subscriptions_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_push_subscriptions_updated_at" ON "push_subscriptions";
CREATE TRIGGER "trg_push_subscriptions_updated_at"
  BEFORE UPDATE ON "push_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "push_subscriptions_set_updated_at"();


-- =============================================================================
-- 2) notification_dispatch_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS "notification_dispatch_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "dispatch_code" TEXT UNIQUE NOT NULL,

  "notification_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "data_payload" JSONB,

  "target_user_id" UUID REFERENCES "app_users"("id"),
  "target_subscription_id" UUID REFERENCES "push_subscriptions"("id"),
  "target_role" TEXT,

  "source_type" TEXT NOT NULL,
  "source_entity_id" UUID,

  "dispatch_status" TEXT NOT NULL DEFAULT 'pending' CHECK ("dispatch_status" IN (
    'pending', 'dispatched', 'delivered', 'failed', 'expired'
  )),

  "scheduled_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "dispatched_at" TIMESTAMPTZ,
  "delivered_at" TIMESTAMPTZ,
  "failed_at" TIMESTAMPTZ,
  "failure_reason" TEXT,

  "clicked_at" TIMESTAMPTZ,
  "dismissed_at" TIMESTAMPTZ,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "notification_dispatch_log_user_idx"
  ON "notification_dispatch_log"("target_user_id");
CREATE INDEX IF NOT EXISTS "notification_dispatch_log_status_idx"
  ON "notification_dispatch_log"("dispatch_status");
CREATE INDEX IF NOT EXISTS "notification_dispatch_log_scheduled_idx"
  ON "notification_dispatch_log"("scheduled_at") WHERE "dispatch_status" = 'pending';
CREATE INDEX IF NOT EXISTS "notification_dispatch_log_source_idx"
  ON "notification_dispatch_log"("source_type", "source_entity_id");

CREATE OR REPLACE FUNCTION "notification_dispatch_log_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_notification_dispatch_log_updated_at" ON "notification_dispatch_log";
CREATE TRIGGER "trg_notification_dispatch_log_updated_at"
  BEFORE UPDATE ON "notification_dispatch_log"
  FOR EACH ROW EXECUTE FUNCTION "notification_dispatch_log_set_updated_at"();


-- =============================================================================
-- 3) offline_action_queue
-- =============================================================================

CREATE TABLE IF NOT EXISTS "offline_action_queue" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "action_code" TEXT UNIQUE NOT NULL,
  "client_action_id" TEXT NOT NULL,

  "user_id" UUID NOT NULL REFERENCES "app_users"("id"),
  "device_subscription_id" UUID REFERENCES "push_subscriptions"("id"),

  "action_type" TEXT NOT NULL CHECK ("action_type" IN (
    'create_site_report',
    'upload_photo',
    'create_qa_qc_issue',
    'record_inventory_movement',
    'submit_purchase_request',
    'log_productivity',
    'add_decision',
    'other'
  )),

  "action_payload" JSONB NOT NULL,

  "client_initiated_at" TIMESTAMPTZ NOT NULL,
  "synced_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  "sync_status" TEXT NOT NULL DEFAULT 'received' CHECK ("sync_status" IN (
    'received', 'processing', 'completed', 'failed', 'rejected', 'duplicate'
  )),

  "created_entity_type" TEXT,
  "created_entity_id" UUID,
  "error_message" TEXT,

  "conflict_detected" BOOLEAN NOT NULL DEFAULT FALSE,
  "conflict_resolution" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("user_id", "client_action_id")
);

CREATE INDEX IF NOT EXISTS "offline_action_queue_user_idx" ON "offline_action_queue"("user_id");
CREATE INDEX IF NOT EXISTS "offline_action_queue_status_idx" ON "offline_action_queue"("sync_status");
CREATE INDEX IF NOT EXISTS "offline_action_queue_synced_idx" ON "offline_action_queue"("synced_at" DESC);
CREATE INDEX IF NOT EXISTS "offline_action_queue_type_idx" ON "offline_action_queue"("action_type");

CREATE OR REPLACE FUNCTION "offline_action_queue_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_offline_action_queue_updated_at" ON "offline_action_queue";
CREATE TRIGGER "trg_offline_action_queue_updated_at"
  BEFORE UPDATE ON "offline_action_queue"
  FOR EACH ROW EXECUTE FUNCTION "offline_action_queue_set_updated_at"();


-- =============================================================================
-- 4) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['push_subscriptions', 'notification_dispatch_log', 'offline_action_queue'])
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
