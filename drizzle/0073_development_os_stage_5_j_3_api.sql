-- =============================================================================
-- 0073 — Development OS · Stage 5.J.3 — API Keys + Rate Limiting
--
-- 3 new tables:
--   - api_keys             per-org bcrypt-hashed API keys, per-key rate-limit tier
--   - api_request_log      per-request audit trail
--   - rate_limit_buckets   sliding-window state per (key, window_type, window_start)
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) api_keys
-- =============================================================================

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  "key_label" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "key_last_4" TEXT NOT NULL,

  "key_type" TEXT NOT NULL DEFAULT 'live' CHECK ("key_type" IN ('live', 'test')),

  "scopes" TEXT[] NOT NULL DEFAULT '{}',

  "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
  "rate_limit_per_hour" INTEGER NOT NULL DEFAULT 1000,
  "rate_limit_per_day" INTEGER NOT NULL DEFAULT 10000,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "expires_at" TIMESTAMPTZ,
  "last_used_at" TIMESTAMPTZ,
  "total_requests" INTEGER NOT NULL DEFAULT 0,

  "created_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "revoked_by" UUID REFERENCES "app_users"("id"),
  "revoked_at" TIMESTAMPTZ,
  "revocation_reason" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("key_hash")
);

CREATE INDEX IF NOT EXISTS "api_keys_organization_idx" ON "api_keys"("organization_id");
CREATE INDEX IF NOT EXISTS "api_keys_active_idx" ON "api_keys"("is_active") WHERE "is_active" = TRUE;
CREATE INDEX IF NOT EXISTS "api_keys_prefix_idx" ON "api_keys"("key_prefix");

CREATE OR REPLACE FUNCTION "api_keys_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_api_keys_updated_at" ON "api_keys";
CREATE TRIGGER "trg_api_keys_updated_at"
  BEFORE UPDATE ON "api_keys"
  FOR EACH ROW EXECUTE FUNCTION "api_keys_set_updated_at"();


-- =============================================================================
-- 2) api_request_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS "api_request_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "api_key_id" UUID NOT NULL REFERENCES "api_keys"("id"),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id"),

  "method" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "query_params" JSONB,
  "request_size_bytes" INTEGER,

  "status_code" INTEGER NOT NULL,
  "response_size_bytes" INTEGER,
  "duration_ms" INTEGER,

  "ip_address" INET,
  "user_agent" TEXT,

  "rate_limit_remaining" INTEGER,
  "was_rate_limited" BOOLEAN NOT NULL DEFAULT FALSE,

  "error_message" TEXT,

  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "api_request_log_key_idx" ON "api_request_log"("api_key_id");
CREATE INDEX IF NOT EXISTS "api_request_log_organization_idx" ON "api_request_log"("organization_id");
CREATE INDEX IF NOT EXISTS "api_request_log_requested_idx" ON "api_request_log"("requested_at" DESC);
CREATE INDEX IF NOT EXISTS "api_request_log_endpoint_idx" ON "api_request_log"("endpoint");
CREATE INDEX IF NOT EXISTS "api_request_log_rate_limited_idx"
  ON "api_request_log"("was_rate_limited") WHERE "was_rate_limited" = TRUE;


-- =============================================================================
-- 3) rate_limit_buckets
-- =============================================================================

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "api_key_id" UUID NOT NULL REFERENCES "api_keys"("id") ON DELETE CASCADE,

  "window_type" TEXT NOT NULL CHECK ("window_type" IN ('minute', 'hour', 'day')),
  "window_start" TIMESTAMPTZ NOT NULL,

  "request_count" INTEGER NOT NULL DEFAULT 1,

  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("api_key_id", "window_type", "window_start")
);

CREATE INDEX IF NOT EXISTS "rate_limit_buckets_key_idx" ON "rate_limit_buckets"("api_key_id");
CREATE INDEX IF NOT EXISTS "rate_limit_buckets_window_idx" ON "rate_limit_buckets"("window_start");


-- =============================================================================
-- 4) RLS — internal-only with org scoping
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['api_keys', 'api_request_log', 'rate_limit_buckets'])
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
