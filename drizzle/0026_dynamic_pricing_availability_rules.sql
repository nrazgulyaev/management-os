-- =============================================================================
-- Prompt 104 — Dynamic Pricing & Availability Rules.
--
-- Nine new tables form the dynamic pricing engine:
--
--   pricing_rule_sets             — named rule groups, scoped global / project / villa
--   pricing_day_of_week_rules     — Mon–Sun multipliers
--   pricing_occupancy_rules       — occupancy / scarcity bands
--   pricing_close_out_rules       — last-minute & far-future bands
--   pricing_channel_rules         — channel-specific markups
--   pricing_min_stay_rules        — minimum-stay engine
--   pricing_stop_sell_rules       — manual or rule-based stop-sell
--   pricing_quote_logs            — observability for quotes
--   channel_push_events           — outbound channel-manager stub
--
-- All nine enable + force RLS; only internal users get policies. Public
-- quote access goes through the server-side route at /api/v1/quote.
-- Existing rate_plans + rate_plan_seasons + rate_plan_overrides are
-- preserved untouched — the dynamic engine layers ABOVE them.
-- =============================================================================

-- 1) pricing_rule_sets
CREATE TABLE IF NOT EXISTS "pricing_rule_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_set_code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "scope_type" text NOT NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'active',
  "priority" integer NOT NULL DEFAULT 100,
  "currency" text NOT NULL DEFAULT 'USD',
  "base_rate_minor" bigint NOT NULL DEFAULT 0,
  "min_rate_minor" bigint,
  "max_rate_minor" bigint,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "pricing_rule_sets"
    ADD CONSTRAINT pricing_rule_sets_scope_check
    CHECK ("scope_type" IN ('global','project','villa'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pricing_rule_sets"
    ADD CONSTRAINT pricing_rule_sets_status_check
    CHECK ("status" IN ('active','paused','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "pricing_rule_sets_scope_idx"
  ON "pricing_rule_sets" ("scope_type");
CREATE INDEX IF NOT EXISTS "pricing_rule_sets_project_idx"
  ON "pricing_rule_sets" ("project_id");
CREATE INDEX IF NOT EXISTS "pricing_rule_sets_villa_idx"
  ON "pricing_rule_sets" ("villa_id");
CREATE INDEX IF NOT EXISTS "pricing_rule_sets_status_idx"
  ON "pricing_rule_sets" ("status");
CREATE INDEX IF NOT EXISTS "pricing_rule_sets_priority_idx"
  ON "pricing_rule_sets" ("priority");

-- 2) pricing_day_of_week_rules
CREATE TABLE IF NOT EXISTS "pricing_day_of_week_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_set_id" uuid NOT NULL REFERENCES "pricing_rule_sets"("id") ON DELETE CASCADE,
  "weekday" integer NOT NULL,
  "modifier_type" text NOT NULL,
  "modifier_value_numeric" numeric(10, 4),
  "modifier_amount_minor" bigint,
  "min_los" integer,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "pricing_day_of_week_rules"
    ADD CONSTRAINT pricing_dow_weekday_check
    CHECK ("weekday" BETWEEN 1 AND 7);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pricing_day_of_week_rules"
    ADD CONSTRAINT pricing_dow_modifier_check
    CHECK ("modifier_type" IN ('percent','fixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "pricing_dow_rules_unique"
  ON "pricing_day_of_week_rules" ("rule_set_id", "weekday");

-- 3) pricing_occupancy_rules
CREATE TABLE IF NOT EXISTS "pricing_occupancy_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_set_id" uuid NOT NULL REFERENCES "pricing_rule_sets"("id") ON DELETE CASCADE,
  "occupancy_min" numeric(5, 4) NOT NULL,
  "occupancy_max" numeric(5, 4) NOT NULL,
  "modifier_type" text NOT NULL,
  "modifier_value_numeric" numeric(10, 4),
  "modifier_amount_minor" bigint,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "pricing_occupancy_rules"
    ADD CONSTRAINT pricing_occ_modifier_check
    CHECK ("modifier_type" IN ('percent','fixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pricing_occupancy_rules"
    ADD CONSTRAINT pricing_occ_range_check
    CHECK ("occupancy_min" >= 0 AND "occupancy_max" <= 1 AND "occupancy_min" < "occupancy_max");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "pricing_occupancy_rules_set_idx"
  ON "pricing_occupancy_rules" ("rule_set_id");

-- 4) pricing_close_out_rules
CREATE TABLE IF NOT EXISTS "pricing_close_out_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_set_id" uuid NOT NULL REFERENCES "pricing_rule_sets"("id") ON DELETE CASCADE,
  "days_before_checkin_min" integer NOT NULL,
  "days_before_checkin_max" integer NOT NULL,
  "modifier_type" text NOT NULL,
  "modifier_value_numeric" numeric(10, 4),
  "modifier_amount_minor" bigint,
  "min_los" integer,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "pricing_close_out_rules"
    ADD CONSTRAINT pricing_close_modifier_check
    CHECK ("modifier_type" IN ('percent','fixed','stop_sell'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pricing_close_out_rules"
    ADD CONSTRAINT pricing_close_range_check
    CHECK ("days_before_checkin_min" <= "days_before_checkin_max");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "pricing_close_out_rules_set_idx"
  ON "pricing_close_out_rules" ("rule_set_id");

-- 5) pricing_channel_rules
CREATE TABLE IF NOT EXISTS "pricing_channel_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_set_id" uuid NOT NULL REFERENCES "pricing_rule_sets"("id") ON DELETE CASCADE,
  "channel_key" text NOT NULL,
  "modifier_type" text NOT NULL,
  "modifier_value_numeric" numeric(10, 4),
  "modifier_amount_minor" bigint,
  "commission_model" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "pricing_channel_rules"
    ADD CONSTRAINT pricing_channel_modifier_check
    CHECK ("modifier_type" IN ('percent','fixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "pricing_channel_rules_unique"
  ON "pricing_channel_rules" ("rule_set_id", "channel_key");

-- 6) pricing_min_stay_rules
CREATE TABLE IF NOT EXISTS "pricing_min_stay_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_set_id" uuid NOT NULL REFERENCES "pricing_rule_sets"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "starts_on" date,
  "ends_on" date,
  "weekday_mask" integer[],
  "min_los" integer NOT NULL,
  "max_los" integer,
  "priority" integer NOT NULL DEFAULT 100,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "pricing_min_stay_rules"
    ADD CONSTRAINT pricing_min_stay_los_check
    CHECK ("min_los" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "pricing_min_stay_rules_set_idx"
  ON "pricing_min_stay_rules" ("rule_set_id");
CREATE INDEX IF NOT EXISTS "pricing_min_stay_rules_priority_idx"
  ON "pricing_min_stay_rules" ("priority");

-- 7) pricing_stop_sell_rules
CREATE TABLE IF NOT EXISTS "pricing_stop_sell_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_set_id" uuid NOT NULL REFERENCES "pricing_rule_sets"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "reason" text NOT NULL,
  "channel_key" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "pricing_stop_sell_rules"
    ADD CONSTRAINT pricing_stop_sell_reason_check
    CHECK ("reason" IN (
      'maintenance_buffer','owner_hold','operational_risk',
      'channel_strategy','manual'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pricing_stop_sell_rules"
    ADD CONSTRAINT pricing_stop_sell_range_check
    CHECK ("starts_on" <= "ends_on");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "pricing_stop_sell_rules_set_idx"
  ON "pricing_stop_sell_rules" ("rule_set_id");
CREATE INDEX IF NOT EXISTS "pricing_stop_sell_rules_dates_idx"
  ON "pricing_stop_sell_rules" ("starts_on", "ends_on");

-- 8) pricing_quote_logs
CREATE TABLE IF NOT EXISTS "pricing_quote_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "channel_key" text NOT NULL DEFAULT 'direct',
  "check_in" date NOT NULL,
  "check_out" date NOT NULL,
  "nights" integer NOT NULL,
  "available" boolean NOT NULL,
  "reason" text,
  "total_minor" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL,
  "request_ip_hash" text,
  "user_agent_hash" text,
  "public_quote" boolean NOT NULL DEFAULT false,
  "rule_set_id" uuid REFERENCES "pricing_rule_sets"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pricing_quote_logs_villa_idx"
  ON "pricing_quote_logs" ("villa_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "pricing_quote_logs_channel_idx"
  ON "pricing_quote_logs" ("channel_key");
CREATE INDEX IF NOT EXISTS "pricing_quote_logs_public_idx"
  ON "pricing_quote_logs" ("public_quote");

-- 9) channel_push_events
CREATE TABLE IF NOT EXISTS "channel_push_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_code" text NOT NULL UNIQUE,
  "event_type" text NOT NULL,
  "channel_key" text NOT NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "date_start" date NOT NULL,
  "date_end" date NOT NULL,
  "payload_json" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'simulated',
  "error_message" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "channel_push_events"
    ADD CONSTRAINT channel_push_event_type_check
    CHECK ("event_type" IN (
      'rate_update','availability_update','stop_sell_update','min_stay_update'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "channel_push_events"
    ADD CONSTRAINT channel_push_status_check
    CHECK ("status" IN ('simulated','queued','sent','failed','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "channel_push_events_channel_idx"
  ON "channel_push_events" ("channel_key");
CREATE INDEX IF NOT EXISTS "channel_push_events_villa_idx"
  ON "channel_push_events" ("villa_id");
CREATE INDEX IF NOT EXISTS "channel_push_events_status_idx"
  ON "channel_push_events" ("status");
CREATE INDEX IF NOT EXISTS "channel_push_events_dates_idx"
  ON "channel_push_events" ("date_start", "date_end");

-- =============================================================================
-- RLS — internal-only. Public quote access uses the server-side
-- /api/v1/quote route (which never queries with user-context auth).
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'pricing_rule_sets',
      'pricing_day_of_week_rules',
      'pricing_occupancy_rules',
      'pricing_close_out_rules',
      'pricing_channel_rules',
      'pricing_min_stay_rules',
      'pricing_stop_sell_rules',
      'pricing_quote_logs',
      'channel_push_events'
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
