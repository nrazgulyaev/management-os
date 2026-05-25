-- DAILY-DIGEST-SPRINT-1 P1.2 + P1.3 — agent_digest_subscriptions +
-- notifications tables.
--
-- Two tables in one migration because they're conceptually coupled:
-- a digest subscription is what makes a notification exist for a user.
-- Both gain RLS so the in-app surfaces (Phase 4) can let signed-in
-- users read their own rows directly without a service-role hop.

BEGIN;

-- =============================================================================
-- 1. agent_digest_subscriptions — per-user opt-in + delivery hour
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_digest_subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code          text NOT NULL,
  user_id             uuid NOT NULL REFERENCES app_users(id)     ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES organizations(id),
  digest_hour_local   int  NOT NULL DEFAULT 7
                           CHECK (digest_hour_local BETWEEN 0 AND 23),
  timezone            text NOT NULL DEFAULT 'Asia/Makassar',
  is_enabled          boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_code, user_id)
);

-- Cron handler reads grouped by (agent_code, timezone) to compute
-- which subscriptions match the current UTC hour. Index covers that
-- access pattern + filters down to active subscriptions only.
CREATE INDEX IF NOT EXISTS idx_digest_subs_active
  ON agent_digest_subscriptions (agent_code, timezone)
  WHERE is_enabled = true;

ALTER TABLE agent_digest_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_digest_subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_read_own_digest_subs ON agent_digest_subscriptions;
CREATE POLICY users_read_own_digest_subs
  ON agent_digest_subscriptions
  FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM app_users WHERE auth_user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: service role only (handled by application
-- backend, not direct user actions). No user-facing write policy
-- means PostgREST/Supabase blocks user writes; the service-role
-- bypass handles our backfill + admin flows.


-- =============================================================================
-- 2. notifications — in-app delivery surface (digests, alerts, info)
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_users(id)     ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id),
  title           text NOT NULL,
  body            text NOT NULL,   -- markdown content
  type            text NOT NULL CHECK (type IN ('digest', 'alert', 'info')),
  related_run_id  uuid REFERENCES agent_runs(id),
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Unread-badge query: WHERE user_id = ? AND read_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_read_own_notifications ON notifications;
CREATE POLICY users_read_own_notifications
  ON notifications
  FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM app_users WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS users_update_own_read_state ON notifications;
CREATE POLICY users_update_own_read_state
  ON notifications
  FOR UPDATE
  USING (
    user_id IN (
      SELECT id FROM app_users WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM app_users WHERE auth_user_id = auth.uid()
    )
  );

-- INSERT policy intentionally absent: digest writes happen from the
-- service role (cron handler). Users cannot fabricate notifications
-- for themselves.

COMMIT;
