-- =============================================================================
-- 0034 — Development OS · Stage 2.1
--
-- Five new tables that extend Management OS (`projects`, `villas`) with
-- development-specific metadata. The Management OS schema is NOT modified;
-- the extension pattern keeps the operational read paths untouched.
--
-- See docs/development-os-architecture.md for the long-running schema
-- contract across stages 2.1 → 2.4.
--
-- This migration is idempotent: every CREATE uses IF NOT EXISTS, every
-- constraint/check is wrapped in DO $$ ... EXCEPTION WHEN duplicate_object.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) development_project_meta — 1:1 extension of `projects`
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "development_project_meta" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL UNIQUE REFERENCES "projects"("id") ON DELETE CASCADE,
  "acquisition_mode" text NOT NULL DEFAULT 'leasehold',
  "lease_tenure_years" integer,
  "lease_start_date" date,
  "lease_end_date" date,
  "land_area_sqm" numeric(14, 2),
  "land_area_ares" numeric(14, 2)
    GENERATED ALWAYS AS ("land_area_sqm" / 100) STORED,
  "land_area_acres" numeric(14, 4)
    GENERATED ALWAYS AS ("land_area_sqm" / 4046.8564224) STORED,
  "gross_square_meters" numeric(14, 2),
  "net_square_meters" numeric(14, 2),
  "acquisition_date" date,
  "planned_handover_date" date,
  "project_currency" text NOT NULL DEFAULT 'USD',
  "operational_currency" text NOT NULL DEFAULT 'IDR',
  "price_escalation_rule_present" boolean NOT NULL DEFAULT false,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "development_project_meta"
    ADD CONSTRAINT development_project_meta_acquisition_mode_check
    CHECK ("acquisition_mode" IN ('leasehold','freehold','joint_venture','mixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 2) project_phases — parallel timeline (multiple phases active at once)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "project_phases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "phase_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'not_started',
  "planned_start_date" date,
  "actual_start_date" date,
  "planned_end_date" date,
  "actual_end_date" date,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "project_phases"
    ADD CONSTRAINT project_phases_phase_type_check
    CHECK ("phase_type" IN (
      'land_sourcing','due_diligence','design','permits','pre_sales',
      'under_construction','pre_handover','handover','managed','archived'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "project_phases"
    ADD CONSTRAINT project_phases_status_check
    CHECK ("status" IN ('not_started','in_progress','completed','on_hold','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "project_phases_project_idx"
  ON "project_phases" ("project_id", "phase_type");

-- At most one active row per (project, phase_type). History is preserved by
-- allowing multiple completed/cancelled rows to coexist.
CREATE UNIQUE INDEX IF NOT EXISTS "project_phases_active_unique"
  ON "project_phases" ("project_id", "phase_type")
  WHERE "status" = 'in_progress';

-- -----------------------------------------------------------------------------
-- 3) land_plots — N per project
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "land_plots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "plot_code" text NOT NULL,
  "acquisition_mode" text NOT NULL DEFAULT 'leasehold',
  -- Free-text JV/landowner contact name. A normalized `development_contacts`
  -- table replaces this in 2.4 (see docs/development-os-architecture.md).
  "owner_contact_name" text,
  "area_sqm" numeric(14, 2),
  "geo_coordinates" jsonb,
  "acquisition_date" date,
  "purchase_price_minor" bigint,
  "purchase_currency" text,
  "upfront_amount_minor" bigint,
  -- [{ amount, currency, dueDate, status, paidAt }]
  "balance_installments" jsonb,
  "lease_start_date" date,
  "lease_end_date" date,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "land_plots"
    ADD CONSTRAINT land_plots_acquisition_mode_check
    CHECK ("acquisition_mode" IN ('leasehold','freehold','joint_venture','mixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "land_plots_project_idx" ON "land_plots" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "land_plots_project_code_uniq"
  ON "land_plots" ("project_id", "plot_code");

-- -----------------------------------------------------------------------------
-- 4) unit_types — project-scoped templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "unit_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "spec_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "base_plot_area_sqm" numeric(14, 2),
  "base_building_area_sqm" numeric(14, 2),
  "base_price_minor" bigint,
  "base_price_currency" text,
  "description" text,
  "is_archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "unit_types_project_idx" ON "unit_types" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unit_types_project_name_uniq"
  ON "unit_types" ("project_id", "name");

-- -----------------------------------------------------------------------------
-- 5) unit_development_meta — 1:1 extension of `villas`
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "unit_development_meta" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid NOT NULL UNIQUE REFERENCES "villas"("id") ON DELETE CASCADE,
  "unit_type_id" uuid REFERENCES "unit_types"("id") ON DELETE SET NULL,
  "unit_category" text NOT NULL DEFAULT 'villa',
  "location_coefficient" numeric(6, 3) NOT NULL DEFAULT 1.000,
  "location_description" text,
  "position_metadata" jsonb,
  "construction_status" text NOT NULL DEFAULT 'planning',
  "construction_progress_percent" numeric(5, 2) NOT NULL DEFAULT 0,
  "cost_basis_minor" bigint,
  "cost_basis_currency" text,
  "target_sale_price_minor" bigint,
  "target_sale_currency" text,
  "current_market_price_minor" bigint,
  "current_market_currency" text,
  "contract_price_minor" bigint,
  "contract_currency" text,
  "unit_type_frozen" boolean NOT NULL DEFAULT false,
  "override_building_area_sqm" numeric(14, 2),
  "override_plot_area_sqm" numeric(14, 2),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "unit_development_meta"
    ADD CONSTRAINT unit_development_meta_unit_category_check
    CHECK ("unit_category" IN (
      'villa','apartment','townhouse',
      'commercial_retail','commercial_restaurant','commercial_spa','commercial_office'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "unit_development_meta"
    ADD CONSTRAINT unit_development_meta_construction_status_check
    CHECK ("construction_status" IN (
      'planning','foundation','structure','mep','finishing','completed','handed_over'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "unit_development_meta"
    ADD CONSTRAINT unit_development_meta_progress_range_check
    CHECK ("construction_progress_percent" >= 0 AND "construction_progress_percent" <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "unit_development_meta_unit_type_idx"
  ON "unit_development_meta" ("unit_type_id");
CREATE INDEX IF NOT EXISTS "unit_development_meta_status_idx"
  ON "unit_development_meta" ("construction_status");

-- =============================================================================
-- RLS — internal-only read/write for the Development OS extension tables.
--
-- Mirrors the Management OS pattern: every base table ENABLES + FORCES RLS,
-- with `public.is_internal_user()` gating both read and write. Owner /
-- guest / vendor / field surfaces do not query these tables.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'development_project_meta',
      'project_phases',
      'land_plots',
      'unit_types',
      'unit_development_meta'
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
