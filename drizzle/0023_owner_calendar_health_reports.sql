-- =============================================================================
-- 0023 — Owner Calendar & Villa Health Reports (Prompt 101).
--
-- Adds four reporting tables behind the owner intelligence portal:
--   • `guest_reviews`          — owner-facing review feed
--   • `owner_calendar_preferences` — per-owner display options
--   • `villa_health_snapshots` — cached villa-period health summary
--   • `owner_visible_events`   — projected owner-safe event feed
--
-- These tables are reporting layers; canonical data still lives in
-- `bookings`, `operation_tasks`, `maintenance_tickets`, etc. The
-- owner portal reads only owner-safe fields (no guest email/phone,
-- no lock codes, no private staff notes).
--
-- RLS: every new table is `ENABLE` + `FORCE`; internal_read /
-- internal_write via `is_internal_user()`. Owner-side selects are
-- scoped via `current_owner_ids()` on the rows that own_visibility
-- applies (see policies below).
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) guest_reviews
CREATE TABLE IF NOT EXISTS "guest_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "source" text NOT NULL,
  "external_review_id" text,
  "reviewer_display_name" text,
  "reviewer_country" text,
  "rating" numeric(3, 2),
  "cleanliness_rating" numeric(3, 2),
  "communication_rating" numeric(3, 2),
  "location_rating" numeric(3, 2),
  "value_rating" numeric(3, 2),
  "text" text,
  "response_text" text,
  "review_date" date,
  "owner_visible" boolean NOT NULL DEFAULT true,
  "public_visible" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'published',
  "sentiment" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_reviews"
    ADD CONSTRAINT guest_reviews_source_check
    CHECK ("source" IN (
      'direct','airbnb','booking_com','google',
      'internal_survey','manual'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_reviews"
    ADD CONSTRAINT guest_reviews_status_check
    CHECK ("status" IN ('draft','published','hidden','flagged'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_reviews"
    ADD CONSTRAINT guest_reviews_sentiment_check
    CHECK (
      "sentiment" IS NULL
      OR "sentiment" IN ('positive','neutral','negative','mixed')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_reviews"
    ADD CONSTRAINT guest_reviews_rating_check
    CHECK (
      "rating" IS NULL OR ("rating" >= 0 AND "rating" <= 5)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_reviews_villa_review_date_idx"
  ON "guest_reviews" ("villa_id", "review_date" DESC);
CREATE INDEX IF NOT EXISTS "guest_reviews_booking_idx"
  ON "guest_reviews" ("booking_id");
CREATE INDEX IF NOT EXISTS "guest_reviews_owner_visible_idx"
  ON "guest_reviews" ("owner_visible");
CREATE INDEX IF NOT EXISTS "guest_reviews_status_idx"
  ON "guest_reviews" ("status");

-- 2) owner_calendar_preferences
CREATE TABLE IF NOT EXISTS "owner_calendar_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "default_currency" text NOT NULL DEFAULT 'USD',
  "show_guest_names" boolean NOT NULL DEFAULT true,
  "show_guest_country" boolean NOT NULL DEFAULT true,
  "show_channel_labels" boolean NOT NULL DEFAULT true,
  "show_maintenance_details" boolean NOT NULL DEFAULT true,
  "calendar_density" text NOT NULL DEFAULT 'comfortable',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "owner_calendar_preferences"
    ADD CONSTRAINT owner_calendar_preferences_density_check
    CHECK ("calendar_density" IN ('compact','comfortable','detailed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "owner_calendar_preferences_owner_unique"
  ON "owner_calendar_preferences" ("owner_id");

-- 3) villa_health_snapshots
CREATE TABLE IF NOT EXISTS "villa_health_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "occupancy_rate" numeric(6, 4),
  "booked_nights" integer NOT NULL DEFAULT 0,
  "owner_stay_nights" integer NOT NULL DEFAULT 0,
  "maintenance_blocked_nights" integer NOT NULL DEFAULT 0,
  "housekeeping_tasks_completed" integer NOT NULL DEFAULT 0,
  "maintenance_tickets_open" integer NOT NULL DEFAULT 0,
  "maintenance_tickets_completed" integer NOT NULL DEFAULT 0,
  "preventive_tasks_due" integer NOT NULL DEFAULT 0,
  "utility_risk_count" integer NOT NULL DEFAULT 0,
  "average_review_rating" numeric(3, 2),
  "negative_review_count" integer NOT NULL DEFAULT 0,
  "reserve_balance_minor" bigint,
  "reserve_currency" text,
  "health_score" numeric(5, 2),
  "health_status" text NOT NULL DEFAULT 'unknown',
  "generated_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "villa_health_snapshots"
    ADD CONSTRAINT villa_health_snapshots_status_check
    CHECK ("health_status" IN (
      'excellent','good','watch','attention','unknown'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "villa_health_snapshots"
    ADD CONSTRAINT villa_health_snapshots_period_check
    CHECK ("period_start" <= "period_end");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "villa_health_snapshots_villa_period_unique"
  ON "villa_health_snapshots" ("villa_id", "period_start", "period_end");
CREATE INDEX IF NOT EXISTS "villa_health_snapshots_project_idx"
  ON "villa_health_snapshots" ("project_id");
CREATE INDEX IF NOT EXISTS "villa_health_snapshots_status_idx"
  ON "villa_health_snapshots" ("health_status");
CREATE INDEX IF NOT EXISTS "villa_health_snapshots_generated_idx"
  ON "villa_health_snapshots" ("generated_at" DESC);

-- 4) owner_visible_events
CREATE TABLE IF NOT EXISTS "owner_visible_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "source_type" text NOT NULL,
  "source_id" uuid,
  "event_date" date NOT NULL,
  "event_end_date" date,
  "title" text NOT NULL,
  "description" text,
  "severity" text NOT NULL DEFAULT 'info',
  "owner_visible" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "owner_visible_events"
    ADD CONSTRAINT owner_visible_events_source_type_check
    CHECK ("source_type" IN (
      'booking','owner_stay','maintenance_block',
      'housekeeping_task','maintenance_ticket','review',
      'statement','reserve','utility','readiness'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "owner_visible_events"
    ADD CONSTRAINT owner_visible_events_severity_check
    CHECK ("severity" IN ('info','success','warning','critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "owner_visible_events"
    ADD CONSTRAINT owner_visible_events_period_check
    CHECK (
      "event_end_date" IS NULL
      OR "event_end_date" >= "event_date"
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "owner_visible_events_owner_date_idx"
  ON "owner_visible_events" ("owner_id", "event_date" DESC);
CREATE INDEX IF NOT EXISTS "owner_visible_events_villa_date_idx"
  ON "owner_visible_events" ("villa_id", "event_date" DESC);
CREATE INDEX IF NOT EXISTS "owner_visible_events_source_idx"
  ON "owner_visible_events" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "owner_visible_events_severity_idx"
  ON "owner_visible_events" ("severity");

-- =============================================================================
-- 5) RLS — internal-only writes; selective owner reads via
-- current_owner_ids() / matching ownership shares.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'guest_reviews',
      'owner_calendar_preferences',
      'villa_health_snapshots',
      'owner_visible_events'
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

-- Owner self-read on guest_reviews — owner can see only owner_visible
-- rows attached to a villa or project they own a share of.
DROP POLICY IF EXISTS owner_self_read ON "guest_reviews";
CREATE POLICY owner_self_read ON "guest_reviews"
  FOR SELECT
  USING (
    "owner_visible" = true
    AND "status" = 'published'
    AND (
      "villa_id" IN (
        SELECT "villa_id"
          FROM "ownership_shares"
         WHERE "owner_id" IN (SELECT public.current_owner_ids())
           AND "status" = 'active'
      )
      OR "project_id" IN (
        SELECT "project_id"
          FROM "ownership_shares"
         WHERE "owner_id" IN (SELECT public.current_owner_ids())
           AND "status" = 'active'
      )
    )
  );

-- Owner self-read + self-write on calendar preferences (owners can
-- store their own display defaults).
DROP POLICY IF EXISTS owner_self_read ON "owner_calendar_preferences";
CREATE POLICY owner_self_read ON "owner_calendar_preferences"
  FOR SELECT
  USING (
    "owner_id" IN (SELECT public.current_owner_ids())
  );

DROP POLICY IF EXISTS owner_self_write ON "owner_calendar_preferences";
CREATE POLICY owner_self_write ON "owner_calendar_preferences"
  FOR ALL
  USING ("owner_id" IN (SELECT public.current_owner_ids()))
  WITH CHECK ("owner_id" IN (SELECT public.current_owner_ids()));

-- Owner self-read on villa health snapshots (only their villa /
-- project).
DROP POLICY IF EXISTS owner_self_read ON "villa_health_snapshots";
CREATE POLICY owner_self_read ON "villa_health_snapshots"
  FOR SELECT
  USING (
    "villa_id" IN (
      SELECT "villa_id"
        FROM "ownership_shares"
       WHERE "owner_id" IN (SELECT public.current_owner_ids())
         AND "status" = 'active'
    )
    OR "project_id" IN (
      SELECT "project_id"
        FROM "ownership_shares"
       WHERE "owner_id" IN (SELECT public.current_owner_ids())
         AND "status" = 'active'
    )
  );

-- Owner self-read on visible events.
DROP POLICY IF EXISTS owner_self_read ON "owner_visible_events";
CREATE POLICY owner_self_read ON "owner_visible_events"
  FOR SELECT
  USING (
    "owner_visible" = true
    AND "owner_id" IN (SELECT public.current_owner_ids())
  );

COMMIT;
