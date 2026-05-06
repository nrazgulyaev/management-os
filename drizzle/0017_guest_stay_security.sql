-- =============================================================================
-- 0017 — Guest Stay Security Hardening (v9G).
--
-- Adds:
--   • `wifi_encryption_keys`             – key versioning for AES-256-GCM
--   • `guest_stay_token_verifications`   – one-time access codes
--   • `guest_stay_security_events`       – append-only security log
--   • `guest_stay_rate_limits`           – per (prefix + IP) rolling window
--
-- Modifies:
--   • `villa_wifi_credentials`
--       + password_ciphertext text         (AES-256-GCM blob, base64url)
--       + password_key_version integer     (FK soft-link to wifi_encryption_keys.key_version)
--       + password_migrated_at timestamptz
--       (display_password retained — column is dropped in v9H once the migration
--        helper has been run against every row.)
--
-- All money rule N/A here. All new tables are internal-only — RLS enforces the
-- line. The guest portal never reads these tables through an authenticated
-- guest session. Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) wifi_encryption_keys
CREATE TABLE IF NOT EXISTS "wifi_encryption_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key_version" integer NOT NULL UNIQUE,
  "encrypted_data_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "rotated_at" timestamptz
);

DO $$ BEGIN
  ALTER TABLE "wifi_encryption_keys"
    ADD CONSTRAINT wifi_encryption_keys_status_check
    CHECK ("status" IN ('active','rotated','revoked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "wifi_encryption_keys_status_idx"
  ON "wifi_encryption_keys" ("status");

-- 2) guest_stay_token_verifications
CREATE TABLE IF NOT EXISTS "guest_stay_token_verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "guest_stay_token_id" uuid NOT NULL
    REFERENCES "guest_stay_tokens"("id") ON DELETE CASCADE,
  "verification_code_hash" text NOT NULL,
  "channel" text NOT NULL,
  "recipient_masked" text,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 5,
  "expires_at" timestamptz NOT NULL,
  "verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_stay_token_verifications"
    ADD CONSTRAINT guest_stay_token_verifications_status_check
    CHECK ("status" IN ('pending','verified','expired','failed','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_stay_token_verifications"
    ADD CONSTRAINT guest_stay_token_verifications_channel_check
    CHECK ("channel" IN ('email','sms','whatsapp','manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One pending verification per token at a time. We expire/replace prior
-- pending rows from the application side before issuing a new one.
CREATE UNIQUE INDEX IF NOT EXISTS "guest_stay_token_verifications_pending_unique"
  ON "guest_stay_token_verifications" ("guest_stay_token_id")
  WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "guest_stay_token_verifications_token_idx"
  ON "guest_stay_token_verifications" ("guest_stay_token_id");
CREATE INDEX IF NOT EXISTS "guest_stay_token_verifications_status_idx"
  ON "guest_stay_token_verifications" ("status");
CREATE INDEX IF NOT EXISTS "guest_stay_token_verifications_expires_idx"
  ON "guest_stay_token_verifications" ("expires_at");

-- 3) guest_stay_security_events  (append-only)
CREATE TABLE IF NOT EXISTS "guest_stay_security_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "guest_stay_token_id" uuid REFERENCES "guest_stay_tokens"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'low',
  "ip_hash" text,
  "user_agent" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_stay_security_events"
    ADD CONSTRAINT guest_stay_security_events_severity_check
    CHECK ("severity" IN ('low','medium','high','critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_stay_security_events"
    ADD CONSTRAINT guest_stay_security_events_event_type_check
    CHECK ("event_type" IN (
      'verification_sent',
      'verification_failed',
      'verification_verified',
      'verification_resent',
      'verification_expired',
      'token_rate_limited',
      'suspicious_access',
      'lock_code_viewed',
      'wifi_viewed',
      'wifi_password_rotated',
      'wifi_password_migrated'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_stay_security_events_token_idx"
  ON "guest_stay_security_events" ("guest_stay_token_id");
CREATE INDEX IF NOT EXISTS "guest_stay_security_events_booking_idx"
  ON "guest_stay_security_events" ("booking_id");
CREATE INDEX IF NOT EXISTS "guest_stay_security_events_type_idx"
  ON "guest_stay_security_events" ("event_type");
CREATE INDEX IF NOT EXISTS "guest_stay_security_events_severity_idx"
  ON "guest_stay_security_events" ("severity");
CREATE INDEX IF NOT EXISTS "guest_stay_security_events_created_idx"
  ON "guest_stay_security_events" ("created_at" DESC);

-- 4) guest_stay_rate_limits  (per token-prefix + IP rolling window)
CREATE TABLE IF NOT EXISTS "guest_stay_rate_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_prefix" text NOT NULL,
  "ip_hash" text NOT NULL,
  "window_start" timestamptz NOT NULL,
  "request_count" integer NOT NULL DEFAULT 0,
  "blocked_until" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "guest_stay_rate_limits_unique"
  ON "guest_stay_rate_limits" ("token_prefix", "ip_hash");

CREATE INDEX IF NOT EXISTS "guest_stay_rate_limits_blocked_idx"
  ON "guest_stay_rate_limits" ("blocked_until");

-- 5) Modify villa_wifi_credentials — add ciphertext columns. Idempotent
-- via ADD COLUMN IF NOT EXISTS.
ALTER TABLE "villa_wifi_credentials"
  ADD COLUMN IF NOT EXISTS "password_ciphertext" text,
  ADD COLUMN IF NOT EXISTS "password_key_version" integer,
  ADD COLUMN IF NOT EXISTS "password_migrated_at" timestamptz;

CREATE INDEX IF NOT EXISTS "villa_wifi_credentials_key_version_idx"
  ON "villa_wifi_credentials" ("password_key_version");

-- =============================================================================
-- 6) RLS — every new table is internal-only. The guest portal never queries
-- these tables through an authenticated guest session; the server route uses
-- the service-role client to apply changes.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'wifi_encryption_keys',
      'guest_stay_token_verifications',
      'guest_stay_security_events',
      'guest_stay_rate_limits'
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
