-- =============================================================================
-- Prompt 106 — Direct Booking Deposit Workflow + Payment Provider Stub.
--
-- Four new tables:
--
--   payment_provider_accounts     — provider configuration (manual stub +
--                                   placeholder rows for future Stripe /
--                                   Xendit / Wise integrations)
--   direct_booking_deposits       — deposit row attached 1:n to a hold +
--                                   request; gates booking conversion
--   direct_booking_deposit_events — append-only timeline
--   payment_webhook_events        — provider webhook envelope; idempotent
--                                   via UNIQUE (provider_key, external_event_id)
--
-- All four enable + force RLS. Public API (`/api/v1/holds/<token>/deposit*`)
-- runs through the service-role connection — no PostgREST surface exposes
-- these tables.
-- =============================================================================

-- 1) payment_provider_accounts
CREATE TABLE IF NOT EXISTS "payment_provider_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider_key" text NOT NULL,
  "display_name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "mode" text NOT NULL DEFAULT 'test',
  "supported_currencies" text[],
  "config_public_json" jsonb,
  "config_private_encrypted" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "payment_provider_accounts"
    ADD CONSTRAINT payment_provider_accounts_status_check
    CHECK ("status" IN ('active','paused','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payment_provider_accounts"
    ADD CONSTRAINT payment_provider_accounts_mode_check
    CHECK ("mode" IN ('test','live'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payment_provider_accounts"
    ADD CONSTRAINT payment_provider_accounts_key_check
    CHECK ("provider_key" IN (
      'manual_stub','stripe','xendit','wise','bank_transfer'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "payment_provider_accounts_status_idx"
  ON "payment_provider_accounts" ("status");
CREATE INDEX IF NOT EXISTS "payment_provider_accounts_provider_key_idx"
  ON "payment_provider_accounts" ("provider_key");

-- 2) direct_booking_deposits
CREATE TABLE IF NOT EXISTS "direct_booking_deposits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hold_id" uuid REFERENCES "direct_booking_holds"("id") ON DELETE CASCADE,
  "request_id" uuid REFERENCES "direct_booking_requests"("id") ON DELETE CASCADE,
  "provider_account_id" uuid REFERENCES "payment_provider_accounts"("id") ON DELETE SET NULL,
  "deposit_code" text NOT NULL UNIQUE,
  "provider_key" text NOT NULL DEFAULT 'manual_stub',
  "provider_session_id" text,
  "provider_payment_id" text,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "payment_url" text,
  "expires_at" timestamptz,
  "paid_at" timestamptz,
  "failed_at" timestamptz,
  "cancelled_at" timestamptz,
  "refunded_at" timestamptz,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_deposits"
    ADD CONSTRAINT direct_booking_deposits_status_check
    CHECK ("status" IN (
      'draft','pending','requires_action','paid','failed',
      'expired','cancelled','refunded','manually_marked_paid'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_deposits"
    ADD CONSTRAINT direct_booking_deposits_amount_check
    CHECK ("amount_minor" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_deposits"
    ADD CONSTRAINT direct_booking_deposits_provider_check
    CHECK ("provider_key" IN (
      'manual_stub','stripe','xendit','wise','bank_transfer'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "direct_booking_deposits_request_idx"
  ON "direct_booking_deposits" ("request_id");
CREATE INDEX IF NOT EXISTS "direct_booking_deposits_hold_idx"
  ON "direct_booking_deposits" ("hold_id");
CREATE INDEX IF NOT EXISTS "direct_booking_deposits_status_idx"
  ON "direct_booking_deposits" ("status");

-- 3) direct_booking_deposit_events
CREATE TABLE IF NOT EXISTS "direct_booking_deposit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deposit_id" uuid NOT NULL REFERENCES "direct_booking_deposits"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "message" text,
  "metadata_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_deposit_events"
    ADD CONSTRAINT direct_booking_deposit_events_actor_check
    CHECK ("actor_type" IN ('guest','internal','system','provider'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "direct_booking_deposit_events_deposit_idx"
  ON "direct_booking_deposit_events" ("deposit_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "direct_booking_deposit_events_type_idx"
  ON "direct_booking_deposit_events" ("event_type");

-- 4) payment_webhook_events
CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider_key" text NOT NULL,
  "external_event_id" text,
  "event_type" text NOT NULL,
  "payload_json" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'received',
  "processed_at" timestamptz,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "payment_webhook_events"
    ADD CONSTRAINT payment_webhook_events_status_check
    CHECK ("status" IN ('received','processed','ignored','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Idempotency: provider_key + external_event_id is unique when both
-- are present. Postgres unique partial index allows multiple NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_external_unique"
  ON "payment_webhook_events" ("provider_key", "external_event_id")
  WHERE "external_event_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "payment_webhook_events_provider_idx"
  ON "payment_webhook_events" ("provider_key");
CREATE INDEX IF NOT EXISTS "payment_webhook_events_status_idx"
  ON "payment_webhook_events" ("status");

-- =============================================================================
-- RLS — internal-only.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'payment_provider_accounts',
      'direct_booking_deposits',
      'direct_booking_deposit_events',
      'payment_webhook_events'
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
