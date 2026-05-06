-- =============================================================================
-- 0058 — Development OS · Stage 5.B.2 — Project Cycle Intelligence
--
-- 3 new tables:
--   - payroll_periods                  payroll commitments per period
--   - team_capacity_tracking           per-role utilization with GENERATED columns
--   - project_cycle_recommendations    AI advisory output (operator-reviewed)
--
-- All RLS-protected, internal-only.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) payroll_periods
-- =============================================================================

CREATE TABLE IF NOT EXISTS "payroll_periods" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "period_label" TEXT NOT NULL UNIQUE,
  "period_type" TEXT NOT NULL CHECK ("period_type" IN (
    'weekly', 'biweekly', 'monthly', 'quarterly'
  )),
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,

  "total_payroll_amount_minor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IDR',
  "total_headcount" INTEGER NOT NULL,

  "allocations" JSONB,

  "status" TEXT NOT NULL DEFAULT 'projected' CHECK ("status" IN (
    'projected', 'committed', 'paid', 'archived'
  )),

  "related_transactions" UUID[] NOT NULL DEFAULT '{}',

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK ("period_end" >= "period_start")
);

CREATE INDEX IF NOT EXISTS "payroll_periods_period_idx"
  ON "payroll_periods"("period_start", "period_end");
CREATE INDEX IF NOT EXISTS "payroll_periods_status_idx"
  ON "payroll_periods"("status");

CREATE OR REPLACE FUNCTION "payroll_periods_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_payroll_periods_updated_at" ON "payroll_periods";
CREATE TRIGGER "trg_payroll_periods_updated_at"
  BEFORE UPDATE ON "payroll_periods"
  FOR EACH ROW EXECUTE FUNCTION "payroll_periods_set_updated_at"();


-- =============================================================================
-- 2) team_capacity_tracking — utilization_rate + idle_hours GENERATED
-- =============================================================================

CREATE TABLE IF NOT EXISTS "team_capacity_tracking" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "tracking_period_start" DATE NOT NULL,
  "tracking_period_end" DATE NOT NULL,

  "role_type" TEXT NOT NULL CHECK ("role_type" IN (
    'pm', 'qs', 'site_supervisor', 'engineer', 'architect',
    'designer', 'admin', 'sales', 'finance', 'other'
  )),

  "total_team_members" INTEGER NOT NULL,
  "total_capacity_hours" NUMERIC(10,2) NOT NULL,

  "allocations" JSONB NOT NULL,

  "utilized_hours" NUMERIC(10,2) NOT NULL,
  "utilization_rate" NUMERIC(7,2) GENERATED ALWAYS AS (
    CASE WHEN "total_capacity_hours" > 0
      THEN ("utilized_hours" / "total_capacity_hours" * 100)::NUMERIC(7,2)
      ELSE 0
    END
  ) STORED,

  "idle_hours" NUMERIC(10,2) GENERATED ALWAYS AS (
    GREATEST("total_capacity_hours" - "utilized_hours", 0)
  ) STORED,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK ("tracking_period_end" >= "tracking_period_start")
);

CREATE INDEX IF NOT EXISTS "team_capacity_tracking_period_idx"
  ON "team_capacity_tracking"("tracking_period_start", "tracking_period_end");
CREATE INDEX IF NOT EXISTS "team_capacity_tracking_role_idx"
  ON "team_capacity_tracking"("role_type");

CREATE OR REPLACE FUNCTION "team_capacity_tracking_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_team_capacity_tracking_updated_at"
  ON "team_capacity_tracking";
CREATE TRIGGER "trg_team_capacity_tracking_updated_at"
  BEFORE UPDATE ON "team_capacity_tracking"
  FOR EACH ROW EXECUTE FUNCTION "team_capacity_tracking_set_updated_at"();


-- =============================================================================
-- 3) project_cycle_recommendations — AI advisory output
-- =============================================================================

CREATE TABLE IF NOT EXISTS "project_cycle_recommendations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "recommendation_code" TEXT UNIQUE NOT NULL,

  "generated_for_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "generated_by_agent" TEXT NOT NULL DEFAULT 'project_cycle_intelligence',

  "context_snapshot" JSONB NOT NULL,

  "recommended_action" TEXT NOT NULL CHECK ("recommended_action" IN (
    'start_new_project_now',
    'start_new_project_in_X_weeks',
    'pause_team_capacity',
    'reduce_team_size',
    'increase_team_size',
    'continue_current_pace',
    'reallocate_capacity'
  )),
  "recommended_timing" TEXT,

  "ai_reasoning" TEXT NOT NULL,
  "supporting_metrics" JSONB,

  "confidence_level" TEXT CHECK ("confidence_level" IN ('low', 'medium', 'high')),

  "operator_status" TEXT NOT NULL DEFAULT 'unreviewed' CHECK ("operator_status" IN (
    'unreviewed', 'reviewed', 'accepted', 'rejected', 'partially_accepted'
  )),
  "operator_notes" TEXT,
  "reviewed_by" UUID REFERENCES "app_users"("id"),
  "reviewed_at" TIMESTAMPTZ,

  "outcome_observed" TEXT,
  "outcome_observed_at" TIMESTAMPTZ,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "project_cycle_recommendations_date_idx"
  ON "project_cycle_recommendations"("generated_for_date" DESC);
CREATE INDEX IF NOT EXISTS "project_cycle_recommendations_status_idx"
  ON "project_cycle_recommendations"("operator_status");

CREATE OR REPLACE FUNCTION "project_cycle_recommendations_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_project_cycle_recommendations_updated_at"
  ON "project_cycle_recommendations";
CREATE TRIGGER "trg_project_cycle_recommendations_updated_at"
  BEFORE UPDATE ON "project_cycle_recommendations"
  FOR EACH ROW EXECUTE FUNCTION "project_cycle_recommendations_set_updated_at"();


-- =============================================================================
-- 4) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'payroll_periods', 'team_capacity_tracking', 'project_cycle_recommendations'
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
