-- =============================================================================
-- 0068 — Development OS · Stage 5.H.2 — Schedule Baselines + Variance
--
-- 2 new tables:
--   - schedule_baselines   immutable JSONB snapshots of approved schedules
--   - schedule_variances   per-task variance vs. baseline (3 GENERATED columns)
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) schedule_baselines
-- =============================================================================

CREATE TABLE IF NOT EXISTS "schedule_baselines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "baseline_code" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,

  "project_id" UUID NOT NULL REFERENCES "projects"("id"),

  "baseline_data" JSONB NOT NULL,

  "version_number" INTEGER NOT NULL DEFAULT 1,
  "is_current_baseline" BOOLEAN NOT NULL DEFAULT TRUE,
  "superseded_by" UUID REFERENCES "schedule_baselines"("id"),
  "superseded_at" TIMESTAMPTZ,

  "approved_by" UUID REFERENCES "app_users"("id"),
  "approved_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "approval_notes" TEXT,

  "calendar_id" UUID REFERENCES "working_calendars"("id"),

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "schedule_baselines_project_idx"
  ON "schedule_baselines"("project_id");
CREATE INDEX IF NOT EXISTS "schedule_baselines_current_idx"
  ON "schedule_baselines"("project_id") WHERE "is_current_baseline" = TRUE;

-- Only one current baseline per project.
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_baselines_current_unique"
  ON "schedule_baselines"("project_id")
  WHERE "is_current_baseline" = TRUE;

CREATE OR REPLACE FUNCTION "schedule_baselines_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_schedule_baselines_updated_at" ON "schedule_baselines";
CREATE TRIGGER "trg_schedule_baselines_updated_at"
  BEFORE UPDATE ON "schedule_baselines"
  FOR EACH ROW EXECUTE FUNCTION "schedule_baselines_set_updated_at"();


-- =============================================================================
-- 2) schedule_variances (3 GENERATED columns)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "schedule_variances" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "baseline_id" UUID NOT NULL REFERENCES "schedule_baselines"("id") ON DELETE CASCADE,
  "task_id" UUID NOT NULL REFERENCES "project_tasks"("id"),

  "baseline_planned_start" DATE NOT NULL,
  "baseline_planned_finish" DATE NOT NULL,
  "baseline_duration_days" INTEGER NOT NULL,
  "baseline_was_critical" BOOLEAN NOT NULL DEFAULT FALSE,

  "current_planned_start" DATE,
  "current_planned_finish" DATE,
  "current_duration_days" INTEGER,
  "current_actual_start" DATE,
  "current_actual_finish" DATE,

  "start_variance_days" INTEGER GENERATED ALWAYS AS (
    EXTRACT(DAY FROM (
      COALESCE("current_actual_start", "current_planned_start")::TIMESTAMP
        - "baseline_planned_start"::TIMESTAMP
    ))::INTEGER
  ) STORED,

  "finish_variance_days" INTEGER GENERATED ALWAYS AS (
    EXTRACT(DAY FROM (
      COALESCE("current_actual_finish", "current_planned_finish")::TIMESTAMP
        - "baseline_planned_finish"::TIMESTAMP
    ))::INTEGER
  ) STORED,

  "duration_variance_days" INTEGER GENERATED ALWAYS AS (
    COALESCE("current_duration_days", "baseline_duration_days")
      - "baseline_duration_days"
  ) STORED,

  "variance_status" TEXT NOT NULL DEFAULT 'unchanged' CHECK ("variance_status" IN (
    'unchanged', 'ahead_of_schedule', 'on_schedule',
    'minor_delay', 'moderate_delay', 'major_delay', 'critical_delay'
  )),

  "computed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("baseline_id", "task_id")
);

CREATE INDEX IF NOT EXISTS "schedule_variances_baseline_idx"
  ON "schedule_variances"("baseline_id");
CREATE INDEX IF NOT EXISTS "schedule_variances_task_idx"
  ON "schedule_variances"("task_id");
CREATE INDEX IF NOT EXISTS "schedule_variances_status_idx"
  ON "schedule_variances"("variance_status");

CREATE OR REPLACE FUNCTION "schedule_variances_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_schedule_variances_updated_at" ON "schedule_variances";
CREATE TRIGGER "trg_schedule_variances_updated_at"
  BEFORE UPDATE ON "schedule_variances"
  FOR EACH ROW EXECUTE FUNCTION "schedule_variances_set_updated_at"();


-- =============================================================================
-- 3) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['schedule_baselines', 'schedule_variances'])
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
