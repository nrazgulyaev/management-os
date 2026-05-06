-- =============================================================================
-- Prompt 105 — Direct Booking Hold & Checkout Stub.
--
-- Five new tables back the no-payment direct-booking flow:
--
--   direct_booking_holds              — temporary inventory hold post-quote
--   direct_booking_requests           — guest contact + stay form submission
--   direct_booking_request_events     — append-only timeline
--   direct_booking_hold_rate_limits   — public anti-abuse counters
--   direct_booking_expiry_runs        — observability for the expiry job
--
-- All five enable + force RLS; only internal users get policies. The
-- public API (`/api/v1/holds*`) is the only route that creates / mutates
-- holds and requests, and it goes through server actions exclusively
-- (no PostgREST surface exposes these tables).
-- =============================================================================

-- 1) direct_booking_holds
CREATE TABLE IF NOT EXISTS "direct_booking_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hold_code" text NOT NULL UNIQUE,
  "hold_token_hash" text NOT NULL UNIQUE,
  "token_prefix" text NOT NULL,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "quote_log_id" uuid REFERENCES "pricing_quote_logs"("id") ON DELETE SET NULL,
  "check_in" date NOT NULL,
  "check_out" date NOT NULL,
  "nights" integer NOT NULL,
  "guest_count" integer NOT NULL DEFAULT 1,
  "channel_key" text NOT NULL DEFAULT 'direct',
  "currency" text NOT NULL,
  "total_minor" bigint NOT NULL,
  "average_nightly_minor" bigint NOT NULL,
  "quote_snapshot_json" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "expires_at" timestamptz NOT NULL,
  "converted_booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "source_ip_hash" text,
  "user_agent_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_holds"
    ADD CONSTRAINT direct_booking_holds_status_check
    CHECK ("status" IN ('active','converted','expired','cancelled','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_holds"
    ADD CONSTRAINT direct_booking_holds_dates_check
    CHECK ("check_out" > "check_in");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_holds"
    ADD CONSTRAINT direct_booking_holds_nights_check
    CHECK ("nights" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_holds"
    ADD CONSTRAINT direct_booking_holds_guest_count_check
    CHECK ("guest_count" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_holds"
    ADD CONSTRAINT direct_booking_holds_total_check
    CHECK ("total_minor" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "direct_booking_holds_villa_dates_idx"
  ON "direct_booking_holds" ("villa_id", "check_in", "check_out");
CREATE INDEX IF NOT EXISTS "direct_booking_holds_status_expires_idx"
  ON "direct_booking_holds" ("status", "expires_at");
CREATE INDEX IF NOT EXISTS "direct_booking_holds_token_prefix_idx"
  ON "direct_booking_holds" ("token_prefix");

-- 2) direct_booking_requests
CREATE TABLE IF NOT EXISTS "direct_booking_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_code" text NOT NULL UNIQUE,
  "hold_id" uuid NOT NULL REFERENCES "direct_booking_holds"("id") ON DELETE CASCADE,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "guest_first_name" text NOT NULL,
  "guest_last_name" text,
  "guest_email" text NOT NULL,
  "guest_phone" text,
  "guest_country" text,
  "guest_count" integer NOT NULL,
  "special_requests" text,
  "arrival_time" text,
  "purpose_of_stay" text,
  "marketing_consent" boolean NOT NULL DEFAULT false,
  "terms_accepted" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'submitted',
  "decision_note" text,
  "reviewed_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_requests"
    ADD CONSTRAINT direct_booking_requests_status_check
    CHECK ("status" IN (
      'submitted','under_review','approved','rejected',
      'expired','cancelled','converted'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_requests"
    ADD CONSTRAINT direct_booking_requests_purpose_check
    CHECK (
      "purpose_of_stay" IS NULL OR
      "purpose_of_stay" IN ('holiday','family','honeymoon','business','event','other')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "direct_booking_requests_status_idx"
  ON "direct_booking_requests" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "direct_booking_requests_email_idx"
  ON "direct_booking_requests" ("guest_email");
CREATE INDEX IF NOT EXISTS "direct_booking_requests_hold_idx"
  ON "direct_booking_requests" ("hold_id");

-- 3) direct_booking_request_events
CREATE TABLE IF NOT EXISTS "direct_booking_request_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL REFERENCES "direct_booking_requests"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "message" text,
  "metadata_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_request_events"
    ADD CONSTRAINT direct_booking_request_events_actor_check
    CHECK ("actor_type" IN ('guest','internal','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "direct_booking_request_events_request_idx"
  ON "direct_booking_request_events" ("request_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "direct_booking_request_events_type_idx"
  ON "direct_booking_request_events" ("event_type");

-- 4) direct_booking_hold_rate_limits
CREATE TABLE IF NOT EXISTS "direct_booking_hold_rate_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ip_hash" text NOT NULL,
  "window_start" timestamptz NOT NULL,
  "hold_count" integer NOT NULL DEFAULT 0,
  "blocked_until" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "direct_booking_hold_rate_limits_ip_window_unique"
  ON "direct_booking_hold_rate_limits" ("ip_hash", "window_start");
CREATE INDEX IF NOT EXISTS "direct_booking_hold_rate_limits_blocked_idx"
  ON "direct_booking_hold_rate_limits" ("blocked_until");

-- 5) direct_booking_expiry_runs
CREATE TABLE IF NOT EXISTS "direct_booking_expiry_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_code" text NOT NULL UNIQUE,
  "expired_holds_count" integer NOT NULL DEFAULT 0,
  "expired_requests_count" integer NOT NULL DEFAULT 0,
  "released_blocks_count" integer NOT NULL DEFAULT 0,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "status" text NOT NULL DEFAULT 'running',
  "error_message" text
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_expiry_runs"
    ADD CONSTRAINT direct_booking_expiry_runs_status_check
    CHECK ("status" IN ('running','success','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "direct_booking_expiry_runs_status_idx"
  ON "direct_booking_expiry_runs" ("status", "started_at" DESC);

-- =============================================================================
-- RLS — internal-only. Public API actions never run under user-context
-- auth (they use the service-role connection), so internal_only policies
-- are sufficient.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'direct_booking_holds',
      'direct_booking_requests',
      'direct_booking_request_events',
      'direct_booking_hold_rate_limits',
      'direct_booking_expiry_runs'
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
