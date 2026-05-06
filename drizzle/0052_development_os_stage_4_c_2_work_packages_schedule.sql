-- =============================================================================
-- 0052 — Development OS · Stage 4.C.2 — Work Packages + Schedule / Gantt
--
-- 3 new tables:
--   - work_packages         hierarchical work packages per project
--   - project_tasks         Gantt building blocks
--   - task_dependencies     predecessor → successor edges
--
-- Adds forward-FK constraints to existing tables that previously held
-- nullable work_package_id columns:
--   dev_os_purchase_requests, dev_invoice_lines, qa_qc_issues,
--   dev_os_inventory_movements
--
-- Critical Path Method (CPM) is computed in pure helpers
-- (lib/development/server/schedule/critical-path-helpers.ts), with
-- columns is_on_critical_path, early_start, late_finish, total_float_days
-- updated nightly by dev_os_critical_path_recompute cron.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) work_packages — hierarchical packages per project
-- =============================================================================

CREATE TABLE IF NOT EXISTS "work_packages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "package_code" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,

  "project_id" UUID NOT NULL REFERENCES "projects"("id"),
  "parent_id" UUID REFERENCES "work_packages"("id"),
  "display_order" INTEGER NOT NULL DEFAULT 0,

  "villa_ids" UUID[] NOT NULL DEFAULT '{}',
  "zone_references" TEXT[],

  "planned_start" DATE,
  "planned_finish" DATE,
  "actual_start" DATE,
  "actual_finish" DATE,
  "progress_percentage" NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK ("progress_percentage" >= 0 AND "progress_percentage" <= 100),

  "budget_categories" UUID[] NOT NULL DEFAULT '{}',
  "budget_amount_minor" BIGINT,
  "committed_amount_minor" BIGINT,
  "actual_amount_minor" BIGINT,

  "responsible_user_id" UUID REFERENCES "app_users"("id"),
  "primary_vendor_id" UUID REFERENCES "vendors"("id"),

  "status" TEXT NOT NULL DEFAULT 'planned' CHECK ("status" IN (
    'planned', 'ready_to_start', 'in_progress', 'completed', 'on_hold', 'cancelled'
  )),

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "work_packages_project_idx" ON "work_packages"("project_id");
CREATE INDEX IF NOT EXISTS "work_packages_parent_idx" ON "work_packages"("parent_id");
CREATE INDEX IF NOT EXISTS "work_packages_status_idx" ON "work_packages"("status");
CREATE INDEX IF NOT EXISTS "work_packages_responsible_idx"
  ON "work_packages"("responsible_user_id");

CREATE OR REPLACE FUNCTION "work_packages_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_work_packages_updated_at" ON "work_packages";
CREATE TRIGGER "trg_work_packages_updated_at"
  BEFORE UPDATE ON "work_packages"
  FOR EACH ROW EXECUTE FUNCTION "work_packages_set_updated_at"();


-- =============================================================================
-- 2) Forward-FK constraints to existing tables
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dev_os_purchase_requests_work_package_fk'
  ) THEN
    ALTER TABLE "dev_os_purchase_requests"
      ADD CONSTRAINT "dev_os_purchase_requests_work_package_fk"
      FOREIGN KEY ("work_package_id") REFERENCES "work_packages"("id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dev_invoice_lines_work_package_fk'
  ) THEN
    ALTER TABLE "dev_invoice_lines"
      ADD CONSTRAINT "dev_invoice_lines_work_package_fk"
      FOREIGN KEY ("work_package_id") REFERENCES "work_packages"("id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qa_qc_issues_work_package_fk'
  ) THEN
    ALTER TABLE "qa_qc_issues"
      ADD CONSTRAINT "qa_qc_issues_work_package_fk"
      FOREIGN KEY ("work_package_id") REFERENCES "work_packages"("id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dev_os_inventory_movements_work_package_fk'
  ) THEN
    ALTER TABLE "dev_os_inventory_movements"
      ADD CONSTRAINT "dev_os_inventory_movements_work_package_fk"
      FOREIGN KEY ("work_package_id") REFERENCES "work_packages"("id");
  END IF;
END $$;


-- =============================================================================
-- 3) project_tasks — Gantt building blocks
-- =============================================================================

CREATE TABLE IF NOT EXISTS "project_tasks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "task_code" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,

  "work_package_id" UUID NOT NULL
    REFERENCES "work_packages"("id") ON DELETE CASCADE,
  "parent_task_id" UUID REFERENCES "project_tasks"("id"),
  "display_order" INTEGER NOT NULL DEFAULT 0,

  "planned_start" DATE NOT NULL,
  "planned_finish" DATE NOT NULL,
  "duration_days" INTEGER GENERATED ALWAYS AS (
    ("planned_finish" - "planned_start") + 1
  ) STORED,
  "actual_start" DATE,
  "actual_finish" DATE,
  "progress_percentage" NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK ("progress_percentage" >= 0 AND "progress_percentage" <= 100),

  "responsible_user_id" UUID REFERENCES "app_users"("id"),
  "vendor_id" UUID REFERENCES "vendors"("id"),

  "status" TEXT NOT NULL DEFAULT 'planned' CHECK ("status" IN (
    'planned', 'ready_to_start', 'in_progress', 'completed', 'blocked', 'cancelled'
  )),

  "is_on_critical_path" BOOLEAN NOT NULL DEFAULT FALSE,
  "early_start" DATE,
  "early_finish" DATE,
  "late_start" DATE,
  "late_finish" DATE,
  "total_float_days" INTEGER,

  "cp_last_computed_at" TIMESTAMPTZ,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK ("planned_finish" >= "planned_start")
);

CREATE INDEX IF NOT EXISTS "project_tasks_wp_idx" ON "project_tasks"("work_package_id");
CREATE INDEX IF NOT EXISTS "project_tasks_parent_idx" ON "project_tasks"("parent_task_id");
CREATE INDEX IF NOT EXISTS "project_tasks_status_idx" ON "project_tasks"("status");
CREATE INDEX IF NOT EXISTS "project_tasks_critical_idx"
  ON "project_tasks"("is_on_critical_path")
  WHERE "is_on_critical_path" = TRUE;
CREATE INDEX IF NOT EXISTS "project_tasks_planned_start_idx"
  ON "project_tasks"("planned_start");

CREATE OR REPLACE FUNCTION "project_tasks_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_project_tasks_updated_at" ON "project_tasks";
CREATE TRIGGER "trg_project_tasks_updated_at"
  BEFORE UPDATE ON "project_tasks"
  FOR EACH ROW EXECUTE FUNCTION "project_tasks_set_updated_at"();


-- =============================================================================
-- 4) task_dependencies — predecessor → successor graph
-- =============================================================================

CREATE TABLE IF NOT EXISTS "task_dependencies" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "predecessor_id" UUID NOT NULL
    REFERENCES "project_tasks"("id") ON DELETE CASCADE,
  "successor_id" UUID NOT NULL
    REFERENCES "project_tasks"("id") ON DELETE CASCADE,

  "dependency_type" TEXT NOT NULL DEFAULT 'finish_to_start' CHECK ("dependency_type" IN (
    'finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'
  )),
  "lag_days" INTEGER NOT NULL DEFAULT 0,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("predecessor_id", "successor_id"),
  CHECK ("predecessor_id" != "successor_id")
);

CREATE INDEX IF NOT EXISTS "task_dependencies_predecessor_idx"
  ON "task_dependencies"("predecessor_id");
CREATE INDEX IF NOT EXISTS "task_dependencies_successor_idx"
  ON "task_dependencies"("successor_id");


-- =============================================================================
-- 5) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'work_packages', 'project_tasks', 'task_dependencies'
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
