-- =============================================================================
-- 0014 — Preventive maintenance intelligence + utilities (v9D).
--
-- Adds a structured maintenance template library, per-villa maintenance
-- plans, smart-window suggestions, utility accounts + readings + payment
-- reminders, and a unified `maintenance_risk_events` table that surfaces
-- everything operators need to chase (overdue maintenance, low utility
-- balance, repeated tickets, unready arrivals).
--
-- Builds on V9A `villa_calendar_blocks` (used by the window scorer) and
-- V9C-era finance bridge primitives (utility payments can optionally
-- materialise as `expense_lines` when the period is open).
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) maintenance_templates — global catalog of preventive checks.
CREATE TABLE IF NOT EXISTS "maintenance_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "default_frequency" text NOT NULL,
  "default_interval_days" integer,
  "default_duration_minutes" integer NOT NULL DEFAULT 60,
  "default_priority" text NOT NULL DEFAULT 'normal',
  "can_be_done_while_occupied" boolean NOT NULL DEFAULT true,
  "guest_disruption_level" text NOT NULL DEFAULT 'low',
  "requires_villa_empty" boolean NOT NULL DEFAULT false,
  "requires_owner_visibility" boolean NOT NULL DEFAULT false,
  "checklist_template_id" uuid REFERENCES "checklist_templates"("id")
    ON DELETE SET NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "maintenance_templates"
    ADD CONSTRAINT maintenance_templates_category_check
    CHECK ("category" IN (
      'ac','pool','pest_control','garden','pump','water_system',
      'electrical','smart_lock','wifi','roof','drainage','fire_safety','general'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "maintenance_templates"
    ADD CONSTRAINT maintenance_templates_frequency_check
    CHECK ("default_frequency" IN (
      'daily','twice_weekly','weekly','biweekly','monthly',
      'quarterly','yearly','custom'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "maintenance_templates"
    ADD CONSTRAINT maintenance_templates_priority_check
    CHECK ("default_priority" IN ('low','normal','high','urgent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "maintenance_templates"
    ADD CONSTRAINT maintenance_templates_disruption_check
    CHECK ("guest_disruption_level" IN ('none','low','medium','high'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "maintenance_templates"
    ADD CONSTRAINT maintenance_templates_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "maintenance_templates_category_idx"
  ON "maintenance_templates" ("category");
CREATE INDEX IF NOT EXISTS "maintenance_templates_status_idx"
  ON "maintenance_templates" ("status");

-- 2) villa_maintenance_plans — per-villa instance of a template, with
-- village-specific cadence + preferences.
CREATE TABLE IF NOT EXISTS "villa_maintenance_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "template_id" uuid NOT NULL REFERENCES "maintenance_templates"("id")
    ON DELETE RESTRICT,
  "plan_name" text NOT NULL,
  "frequency" text NOT NULL,
  "interval_days" integer,
  "duration_minutes" integer NOT NULL DEFAULT 60,
  "priority" text NOT NULL DEFAULT 'normal',
  "can_be_done_while_occupied" boolean NOT NULL DEFAULT true,
  "guest_disruption_level" text NOT NULL DEFAULT 'low',
  "requires_villa_empty" boolean NOT NULL DEFAULT false,
  "preferred_weekdays" jsonb,
  "avoid_weekdays" jsonb,
  "preferred_time_window_start" time,
  "preferred_time_window_end" time,
  "last_completed_at" timestamptz,
  "next_due_at" timestamptz,
  "last_generated_task_id" uuid REFERENCES "operation_tasks"("id")
    ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'active',
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "villa_maintenance_plans"
    ADD CONSTRAINT villa_maintenance_plans_status_check
    CHECK ("status" IN ('active','paused','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "villa_maintenance_plans"
    ADD CONSTRAINT villa_maintenance_plans_frequency_check
    CHECK ("frequency" IN (
      'daily','twice_weekly','weekly','biweekly','monthly',
      'quarterly','yearly','custom'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "villa_maintenance_plans"
    ADD CONSTRAINT villa_maintenance_plans_priority_check
    CHECK ("priority" IN ('low','normal','high','urgent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "villa_maintenance_plans"
    ADD CONSTRAINT villa_maintenance_plans_disruption_check
    CHECK ("guest_disruption_level" IN ('none','low','medium','high'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "villa_maintenance_plans_villa_idx"
  ON "villa_maintenance_plans" ("villa_id");
CREATE INDEX IF NOT EXISTS "villa_maintenance_plans_project_idx"
  ON "villa_maintenance_plans" ("project_id");
CREATE INDEX IF NOT EXISTS "villa_maintenance_plans_template_idx"
  ON "villa_maintenance_plans" ("template_id");
CREATE INDEX IF NOT EXISTS "villa_maintenance_plans_status_idx"
  ON "villa_maintenance_plans" ("status");
CREATE INDEX IF NOT EXISTS "villa_maintenance_plans_next_due_idx"
  ON "villa_maintenance_plans" ("next_due_at");

-- 3) maintenance_window_suggestions — scored candidate windows.
CREATE TABLE IF NOT EXISTS "maintenance_window_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_maintenance_plan_id" uuid NOT NULL
    REFERENCES "villa_maintenance_plans"("id") ON DELETE CASCADE,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "suggested_start" timestamptz NOT NULL,
  "suggested_end" timestamptz NOT NULL,
  "score" numeric NOT NULL DEFAULT 0,
  "reason" text,
  "conflict_count" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'suggested',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "maintenance_window_suggestions"
    ADD CONSTRAINT maintenance_window_suggestions_status_check
    CHECK ("status" IN ('suggested','accepted','rejected','expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "maintenance_window_suggestions"
    ADD CONSTRAINT maintenance_window_suggestions_time_check
    CHECK ("suggested_end" > "suggested_start");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "maintenance_window_suggestions_plan_idx"
  ON "maintenance_window_suggestions" ("villa_maintenance_plan_id");
CREATE INDEX IF NOT EXISTS "maintenance_window_suggestions_villa_idx"
  ON "maintenance_window_suggestions" ("villa_id", "suggested_start");
CREATE INDEX IF NOT EXISTS "maintenance_window_suggestions_status_idx"
  ON "maintenance_window_suggestions" ("status");

-- 4) utility_accounts — one per villa+utility, with thresholds in minor units.
CREATE TABLE IF NOT EXISTS "utility_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "utility_type" text NOT NULL,
  "provider_name" text,
  "account_number" text,
  "token_meter" boolean NOT NULL DEFAULT false,
  "billing_cycle_day" integer,
  "currency" text NOT NULL DEFAULT 'IDR',
  "average_monthly_cost_minor" bigint,
  "low_balance_threshold_minor" bigint,
  "critical_balance_threshold_minor" bigint,
  "status" text NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "utility_accounts"
    ADD CONSTRAINT utility_accounts_type_check
    CHECK ("utility_type" IN (
      'electricity','water','internet','gas','waste','security','other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "utility_accounts"
    ADD CONSTRAINT utility_accounts_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "utility_accounts"
    ADD CONSTRAINT utility_accounts_billing_day_check
    CHECK ("billing_cycle_day" IS NULL OR ("billing_cycle_day" BETWEEN 1 AND 31));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "utility_accounts_villa_idx"
  ON "utility_accounts" ("villa_id");
CREATE INDEX IF NOT EXISTS "utility_accounts_project_idx"
  ON "utility_accounts" ("project_id");
CREATE INDEX IF NOT EXISTS "utility_accounts_type_idx"
  ON "utility_accounts" ("utility_type");
CREATE INDEX IF NOT EXISTS "utility_accounts_status_idx"
  ON "utility_accounts" ("status");

-- 5) utility_readings — append-only meter / token / bill-amount captures.
CREATE TABLE IF NOT EXISTS "utility_readings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "utility_account_id" uuid NOT NULL
    REFERENCES "utility_accounts"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "reading_type" text NOT NULL,
  "reading_value" numeric,
  "balance_minor" bigint,
  "currency" text,
  "reading_at" timestamptz NOT NULL DEFAULT now(),
  "source" text NOT NULL DEFAULT 'manual',
  "recorded_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "utility_readings"
    ADD CONSTRAINT utility_readings_type_check
    CHECK ("reading_type" IN ('meter','token_balance','bill_amount','manual_check'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "utility_readings"
    ADD CONSTRAINT utility_readings_source_check
    CHECK ("source" IN ('manual','field_check','import','api'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "utility_readings_account_idx"
  ON "utility_readings" ("utility_account_id", "reading_at" DESC);
CREATE INDEX IF NOT EXISTS "utility_readings_villa_idx"
  ON "utility_readings" ("villa_id");
CREATE INDEX IF NOT EXISTS "utility_readings_type_idx"
  ON "utility_readings" ("reading_type");

-- 6) utility_payment_reminders — operator-side payment ledger.
CREATE TABLE IF NOT EXISTS "utility_payment_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "utility_account_id" uuid NOT NULL
    REFERENCES "utility_accounts"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "due_date" date NOT NULL,
  "amount_minor" bigint,
  "currency" text NOT NULL DEFAULT 'IDR',
  "status" text NOT NULL DEFAULT 'open',
  "paid_at" timestamptz,
  "paid_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "linked_expense_line_id" uuid REFERENCES "expense_lines"("id")
    ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "utility_payment_reminders"
    ADD CONSTRAINT utility_payment_reminders_status_check
    CHECK ("status" IN ('open','paid','overdue','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "utility_payment_reminders_account_idx"
  ON "utility_payment_reminders" ("utility_account_id");
CREATE INDEX IF NOT EXISTS "utility_payment_reminders_due_idx"
  ON "utility_payment_reminders" ("due_date");
CREATE INDEX IF NOT EXISTS "utility_payment_reminders_status_idx"
  ON "utility_payment_reminders" ("status");

-- 7) maintenance_risk_events — unified risk feed.
CREATE TABLE IF NOT EXISTS "maintenance_risk_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "risk_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'medium',
  "title" text NOT NULL,
  "description" text,
  "source_type" text,
  "source_id" uuid,
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz
);

DO $$ BEGIN
  ALTER TABLE "maintenance_risk_events"
    ADD CONSTRAINT maintenance_risk_events_type_check
    CHECK ("risk_type" IN (
      'overdue_maintenance','utility_low_balance','utility_critical_balance',
      'no_recent_reading','repeated_ticket','upcoming_guest_conflict',
      'arrival_not_ready'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "maintenance_risk_events"
    ADD CONSTRAINT maintenance_risk_events_severity_check
    CHECK ("severity" IN ('low','medium','high','critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "maintenance_risk_events"
    ADD CONSTRAINT maintenance_risk_events_status_check
    CHECK ("status" IN ('open','acknowledged','resolved','dismissed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Idempotency: at most one OPEN risk per (risk_type, source_type, source_id).
-- Lets `scanMaintenanceRisks` re-run without cluttering the feed.
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_risk_events_open_unique"
  ON "maintenance_risk_events" ("risk_type", "source_type", "source_id")
  WHERE "status" = 'open' AND "source_type" IS NOT NULL AND "source_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "maintenance_risk_events_villa_idx"
  ON "maintenance_risk_events" ("villa_id");
CREATE INDEX IF NOT EXISTS "maintenance_risk_events_project_idx"
  ON "maintenance_risk_events" ("project_id");
CREATE INDEX IF NOT EXISTS "maintenance_risk_events_status_idx"
  ON "maintenance_risk_events" ("status");
CREATE INDEX IF NOT EXISTS "maintenance_risk_events_severity_idx"
  ON "maintenance_risk_events" ("severity");

-- 8) RLS — every new table is internal-only. Owners + guests stay out.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'maintenance_templates',
      'villa_maintenance_plans',
      'maintenance_window_suggestions',
      'utility_accounts',
      'utility_readings',
      'utility_payment_reminders',
      'maintenance_risk_events'
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
  END LOOP;
END $$;

-- Utility readings + payment reminders are *write*-sensitive (touch
-- finance-adjacent records). Add explicit internal_write on top.
DROP POLICY IF EXISTS internal_write ON "utility_readings";
CREATE POLICY internal_write ON "utility_readings"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS internal_write ON "utility_payment_reminders";
CREATE POLICY internal_write ON "utility_payment_reminders"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

COMMIT;
