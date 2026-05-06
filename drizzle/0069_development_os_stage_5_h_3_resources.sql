-- =============================================================================
-- 0069 — Development OS · Stage 5.H.3 — Resources + Productivity
--
-- 3 new tables:
--   - resource_pools             vendor teams / internal / individuals / equipment
--   - task_resource_assignments  per-task allocations
--   - productivity_logs          per-day actuals; productivity_rate is GENERATED
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) resource_pools
-- =============================================================================

CREATE TABLE IF NOT EXISTS "resource_pools" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "resource_code" TEXT UNIQUE NOT NULL,
  "display_name" TEXT NOT NULL,

  "resource_type" TEXT NOT NULL CHECK ("resource_type" IN (
    'vendor_team', 'internal_team', 'individual', 'equipment', 'subcontractor'
  )),

  "vendor_id" UUID REFERENCES "vendors"("id"),

  "total_capacity_per_day" NUMERIC(10,2),
  "capacity_unit" TEXT NOT NULL DEFAULT 'hours' CHECK ("capacity_unit" IN ('hours', 'days', 'units')),

  "standard_rate_per_unit_minor" BIGINT,
  "rate_currency" TEXT DEFAULT 'IDR',

  "default_calendar_id" UUID REFERENCES "working_calendars"("id"),

  "skills" TEXT[] NOT NULL DEFAULT '{}',

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "resource_pools_type_idx" ON "resource_pools"("resource_type");
CREATE INDEX IF NOT EXISTS "resource_pools_vendor_idx" ON "resource_pools"("vendor_id");
CREATE INDEX IF NOT EXISTS "resource_pools_active_idx" ON "resource_pools"("is_active");

CREATE OR REPLACE FUNCTION "resource_pools_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_resource_pools_updated_at" ON "resource_pools";
CREATE TRIGGER "trg_resource_pools_updated_at"
  BEFORE UPDATE ON "resource_pools"
  FOR EACH ROW EXECUTE FUNCTION "resource_pools_set_updated_at"();


-- =============================================================================
-- 2) task_resource_assignments
-- =============================================================================

CREATE TABLE IF NOT EXISTS "task_resource_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "task_id" UUID NOT NULL REFERENCES "project_tasks"("id") ON DELETE CASCADE,
  "resource_id" UUID NOT NULL REFERENCES "resource_pools"("id"),

  "allocated_capacity_per_day" NUMERIC(10,2) NOT NULL,
  "allocation_start" DATE NOT NULL,
  "allocation_end" DATE NOT NULL,

  "status" TEXT NOT NULL DEFAULT 'planned' CHECK ("status" IN (
    'planned', 'confirmed', 'in_progress', 'completed', 'cancelled'
  )),

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK ("allocation_end" >= "allocation_start")
);

CREATE INDEX IF NOT EXISTS "task_resource_assignments_task_idx"
  ON "task_resource_assignments"("task_id");
CREATE INDEX IF NOT EXISTS "task_resource_assignments_resource_idx"
  ON "task_resource_assignments"("resource_id");
CREATE INDEX IF NOT EXISTS "task_resource_assignments_period_idx"
  ON "task_resource_assignments"("allocation_start", "allocation_end");

CREATE OR REPLACE FUNCTION "task_resource_assignments_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_task_resource_assignments_updated_at" ON "task_resource_assignments";
CREATE TRIGGER "trg_task_resource_assignments_updated_at"
  BEFORE UPDATE ON "task_resource_assignments"
  FOR EACH ROW EXECUTE FUNCTION "task_resource_assignments_set_updated_at"();


-- =============================================================================
-- 3) productivity_logs (productivity_rate GENERATED)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "productivity_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "task_id" UUID REFERENCES "project_tasks"("id"),
  "resource_id" UUID REFERENCES "resource_pools"("id"),
  "project_id" UUID NOT NULL REFERENCES "projects"("id"),
  "villa_id" UUID REFERENCES "villas"("id"),

  "log_date" DATE NOT NULL,

  "trade_category" TEXT,
  "activity_description" TEXT,

  "planned_hours" NUMERIC(8,2),
  "actual_hours" NUMERIC(8,2) NOT NULL,
  "quantity_completed" NUMERIC(12,4),
  "unit_of_measure" TEXT,

  "productivity_rate" NUMERIC(14,6) GENERATED ALWAYS AS (
    CASE WHEN "actual_hours" > 0 AND "quantity_completed" IS NOT NULL
      THEN "quantity_completed" / "actual_hours"
      ELSE NULL
    END
  ) STORED,

  "data_source" TEXT NOT NULL CHECK ("data_source" IN (
    'site_report', 'manual_entry', 'attendance_log', 'mobile_app'
  )),
  "related_site_report_id" UUID REFERENCES "site_reports"("id"),
  "recorded_by" UUID NOT NULL REFERENCES "app_users"("id"),

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "productivity_logs_task_idx" ON "productivity_logs"("task_id");
CREATE INDEX IF NOT EXISTS "productivity_logs_resource_idx" ON "productivity_logs"("resource_id");
CREATE INDEX IF NOT EXISTS "productivity_logs_project_idx" ON "productivity_logs"("project_id");
CREATE INDEX IF NOT EXISTS "productivity_logs_date_idx" ON "productivity_logs"("log_date" DESC);
CREATE INDEX IF NOT EXISTS "productivity_logs_trade_idx" ON "productivity_logs"("trade_category");

CREATE OR REPLACE FUNCTION "productivity_logs_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_productivity_logs_updated_at" ON "productivity_logs";
CREATE TRIGGER "trg_productivity_logs_updated_at"
  BEFORE UPDATE ON "productivity_logs"
  FOR EACH ROW EXECUTE FUNCTION "productivity_logs_set_updated_at"();


-- =============================================================================
-- 4) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['resource_pools', 'task_resource_assignments', 'productivity_logs'])
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
