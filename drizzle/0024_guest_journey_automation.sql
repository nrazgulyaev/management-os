-- =============================================================================
-- Prompt 102 — Guest Journey Automation.
--
-- Five new tables back the deterministic guest journey:
--   guest_journey_rules          — configurable journey automation rules
--   guest_journey_suggestions    — guest-visible CTAs inside /stay/[token]
--   guest_journey_runs           — per-rule / per-booking execution log
--   guest_journey_events         — append-only guest-journey timeline
--   guest_review_requests        — post-stay review request tracking
--
-- All five enable + force RLS. Internal users get the only policies;
-- guest reads happen exclusively through token-gated server actions
-- in src/features/guest-journey, and owner reads happen exclusively
-- through the projection layer (owner_visible_events) — never the raw
-- guest_journey_* tables.
-- =============================================================================

-- 1) guest_journey_rules
CREATE TABLE IF NOT EXISTS "guest_journey_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "journey_stage" text NOT NULL,
  "trigger_anchor" text NOT NULL,
  "offset_minutes" integer NOT NULL DEFAULT 0,
  "channel" text NOT NULL DEFAULT 'in_app',
  "template_key" text,
  "suggestion_type" text,
  "service_id" uuid REFERENCES "guest_services"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "applies_to_channel" text,
  "conditions_json" jsonb,
  "payload_json" jsonb,
  "priority" text NOT NULL DEFAULT 'normal',
  "status" text NOT NULL DEFAULT 'active',
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_journey_rules"
    ADD CONSTRAINT guest_journey_rules_stage_check
    CHECK ("journey_stage" IN (
      'pre_arrival','arrival_day','in_stay','pre_checkout','checkout_day','post_stay'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_journey_rules"
    ADD CONSTRAINT guest_journey_rules_anchor_check
    CHECK ("trigger_anchor" IN (
      'booking_created','check_in','check_out','stay_token_issued',
      'guest_arrived','guest_checked_out'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_journey_rules"
    ADD CONSTRAINT guest_journey_rules_channel_check
    CHECK ("channel" IN ('in_app','email','sms','whatsapp','none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_journey_rules"
    ADD CONSTRAINT guest_journey_rules_priority_check
    CHECK ("priority" IN ('low','normal','high','urgent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_journey_rules"
    ADD CONSTRAINT guest_journey_rules_status_check
    CHECK ("status" IN ('active','paused','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_journey_rules_status_idx"
  ON "guest_journey_rules" ("status");
CREATE INDEX IF NOT EXISTS "guest_journey_rules_stage_idx"
  ON "guest_journey_rules" ("journey_stage");
CREATE INDEX IF NOT EXISTS "guest_journey_rules_anchor_idx"
  ON "guest_journey_rules" ("trigger_anchor");
CREATE INDEX IF NOT EXISTS "guest_journey_rules_villa_idx"
  ON "guest_journey_rules" ("villa_id");
CREATE INDEX IF NOT EXISTS "guest_journey_rules_project_idx"
  ON "guest_journey_rules" ("project_id");

-- 2) guest_journey_suggestions
CREATE TABLE IF NOT EXISTS "guest_journey_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE CASCADE,
  "stay_token_id" uuid REFERENCES "guest_stay_tokens"("id") ON DELETE SET NULL,
  "rule_id" uuid REFERENCES "guest_journey_rules"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "suggestion_type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "cta_label" text,
  "cta_href" text,
  "service_id" uuid REFERENCES "guest_services"("id") ON DELETE SET NULL,
  "suggested_for" timestamptz,
  "expires_at" timestamptz,
  "status" text NOT NULL DEFAULT 'active',
  "clicked_at" timestamptz,
  "dismissed_at" timestamptz,
  "converted_at" timestamptz,
  "priority" text NOT NULL DEFAULT 'normal',
  "owner_visible" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_journey_suggestions"
    ADD CONSTRAINT guest_journey_suggestions_status_check
    CHECK ("status" IN ('active','clicked','dismissed','expired','converted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_journey_suggestions"
    ADD CONSTRAINT guest_journey_suggestions_priority_check
    CHECK ("priority" IN ('low','normal','high','urgent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "guest_journey_suggestions_booking_rule_unique"
  ON "guest_journey_suggestions" ("booking_id", "rule_id")
  WHERE "rule_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "guest_journey_suggestions_booking_status_idx"
  ON "guest_journey_suggestions" ("booking_id", "status");
CREATE INDEX IF NOT EXISTS "guest_journey_suggestions_token_status_idx"
  ON "guest_journey_suggestions" ("stay_token_id", "status");
CREATE INDEX IF NOT EXISTS "guest_journey_suggestions_for_idx"
  ON "guest_journey_suggestions" ("suggested_for");
CREATE INDEX IF NOT EXISTS "guest_journey_suggestions_type_idx"
  ON "guest_journey_suggestions" ("suggestion_type");

-- 3) guest_journey_runs
CREATE TABLE IF NOT EXISTS "guest_journey_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE CASCADE,
  "stay_token_id" uuid REFERENCES "guest_stay_tokens"("id") ON DELETE SET NULL,
  "rule_id" uuid REFERENCES "guest_journey_rules"("id") ON DELETE CASCADE,
  "scheduled_for" timestamptz,
  "executed_at" timestamptz,
  "status" text NOT NULL DEFAULT 'pending',
  "skip_reason" text,
  "error_message" text,
  "notification_queue_id" uuid REFERENCES "notification_queue"("id") ON DELETE SET NULL,
  "suggestion_id" uuid REFERENCES "guest_journey_suggestions"("id") ON DELETE SET NULL,
  "metrics_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_journey_runs"
    ADD CONSTRAINT guest_journey_runs_status_check
    CHECK ("status" IN ('pending','executed','skipped','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "guest_journey_runs_booking_rule_unique"
  ON "guest_journey_runs" ("booking_id", "rule_id");
CREATE INDEX IF NOT EXISTS "guest_journey_runs_status_scheduled_idx"
  ON "guest_journey_runs" ("status", "scheduled_for");
CREATE INDEX IF NOT EXISTS "guest_journey_runs_booking_idx"
  ON "guest_journey_runs" ("booking_id");
CREATE INDEX IF NOT EXISTS "guest_journey_runs_rule_idx"
  ON "guest_journey_runs" ("rule_id");

-- 4) guest_journey_events
CREATE TABLE IF NOT EXISTS "guest_journey_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE CASCADE,
  "stay_token_id" uuid REFERENCES "guest_stay_tokens"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "source_type" text,
  "source_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "event_at" timestamptz NOT NULL DEFAULT now(),
  "owner_visible" boolean NOT NULL DEFAULT false,
  "severity" text NOT NULL DEFAULT 'info',
  "metadata_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_journey_events"
    ADD CONSTRAINT guest_journey_events_severity_check
    CHECK ("severity" IN ('info','success','warning','critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_journey_events"
    ADD CONSTRAINT guest_journey_events_source_check
    CHECK (
      "source_type" IS NULL
      OR "source_type" IN ('rule','guest_action','admin_action','system')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_journey_events_booking_at_idx"
  ON "guest_journey_events" ("booking_id", "event_at" DESC);
CREATE INDEX IF NOT EXISTS "guest_journey_events_token_at_idx"
  ON "guest_journey_events" ("stay_token_id", "event_at" DESC);
CREATE INDEX IF NOT EXISTS "guest_journey_events_owner_visible_idx"
  ON "guest_journey_events" ("owner_visible");

-- 5) guest_review_requests
CREATE TABLE IF NOT EXISTS "guest_review_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE CASCADE,
  "guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "channel" text NOT NULL,
  "review_target_url" text,
  "request_stage" text NOT NULL DEFAULT 'initial',
  "status" text NOT NULL DEFAULT 'pending',
  "scheduled_for" timestamptz,
  "sent_at" timestamptz,
  "clicked_at" timestamptz,
  "completed_at" timestamptz,
  "notification_queue_id" uuid REFERENCES "notification_queue"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_review_requests"
    ADD CONSTRAINT guest_review_requests_channel_check
    CHECK ("channel" IN ('direct','airbnb','booking_com','google','internal_survey','manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_review_requests"
    ADD CONSTRAINT guest_review_requests_stage_check
    CHECK ("request_stage" IN ('initial','reminder_1','reminder_2','completed','skipped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_review_requests"
    ADD CONSTRAINT guest_review_requests_status_check
    CHECK ("status" IN ('pending','sent','clicked','completed','skipped','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "guest_review_requests_booking_channel_unique"
  ON "guest_review_requests" ("booking_id", "channel");
CREATE INDEX IF NOT EXISTS "guest_review_requests_status_scheduled_idx"
  ON "guest_review_requests" ("status", "scheduled_for");

-- =============================================================================
-- RLS — internal-only writes; no public/guest/owner direct access. Guest
-- access flows through token-gated server actions; owner access flows
-- through owner_visible_events (rebuilt from guest_journey_events with
-- owner_visible=true).
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'guest_journey_rules',
      'guest_journey_suggestions',
      'guest_journey_runs',
      'guest_journey_events',
      'guest_review_requests'
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
