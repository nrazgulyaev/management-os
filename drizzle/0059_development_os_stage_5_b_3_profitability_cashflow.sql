-- =============================================================================
-- 0059 — Development OS · Stage 5.B.3 + 5.B.4 — Unit Profitability + Cashflow
--
-- 2 new tables:
--   - unit_cost_allocations  per-asset cost basis snapshot with GENERATED
--                            columns + partial unique index on is_current
--   - cashflow_forecasts     12-month forward cashflow projection (JSONB)
--
-- All RLS-protected, internal-only.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) unit_cost_allocations — per-asset cost basis
-- =============================================================================

CREATE TABLE IF NOT EXISTS "unit_cost_allocations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "asset_id" UUID NOT NULL REFERENCES "villas"("id"),
  "project_id" UUID NOT NULL REFERENCES "projects"("id"),

  "computed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "computed_for_date" DATE NOT NULL DEFAULT CURRENT_DATE,

  "land_cost_allocated_minor" BIGINT NOT NULL DEFAULT 0,
  "land_allocation_method" TEXT,

  "hard_cost_direct_minor" BIGINT NOT NULL DEFAULT 0,
  "hard_cost_allocated_minor" BIGINT NOT NULL DEFAULT 0,

  "soft_cost_allocated_minor" BIGINT NOT NULL DEFAULT 0,
  "soft_cost_method" TEXT,

  "marketing_cost_allocated_minor" BIGINT NOT NULL DEFAULT 0,
  "marketing_allocation_method" TEXT,

  "financing_cost_allocated_minor" BIGINT NOT NULL DEFAULT 0,

  "contingency_used_minor" BIGINT NOT NULL DEFAULT 0,

  "total_cost_basis_minor" BIGINT GENERATED ALWAYS AS (
    "land_cost_allocated_minor" + "hard_cost_direct_minor" + "hard_cost_allocated_minor" +
    "soft_cost_allocated_minor" + "marketing_cost_allocated_minor" +
    "financing_cost_allocated_minor" + "contingency_used_minor"
  ) STORED,

  "expected_sale_price_minor" BIGINT,
  "actual_sale_price_minor" BIGINT,
  "expected_rental_revenue_annual_minor" BIGINT,

  "expected_margin_minor" BIGINT GENERATED ALWAYS AS (
    COALESCE("actual_sale_price_minor", "expected_sale_price_minor", 0) -
    ("land_cost_allocated_minor" + "hard_cost_direct_minor" + "hard_cost_allocated_minor" +
     "soft_cost_allocated_minor" + "marketing_cost_allocated_minor" +
     "financing_cost_allocated_minor" + "contingency_used_minor")
  ) STORED,

  "margin_percentage" NUMERIC(7,4),

  "currency" TEXT NOT NULL DEFAULT 'IDR',

  "computed_by" UUID REFERENCES "app_users"("id"),
  "computation_method" TEXT,
  "is_current" BOOLEAN NOT NULL DEFAULT TRUE,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "unit_cost_allocations_asset_idx"
  ON "unit_cost_allocations"("asset_id");
CREATE INDEX IF NOT EXISTS "unit_cost_allocations_project_idx"
  ON "unit_cost_allocations"("project_id");
CREATE INDEX IF NOT EXISTS "unit_cost_allocations_current_idx"
  ON "unit_cost_allocations"("asset_id") WHERE "is_current" = TRUE;

-- Partial unique: only one current allocation per asset.
CREATE UNIQUE INDEX IF NOT EXISTS "unit_cost_allocations_asset_current_unique"
  ON "unit_cost_allocations"("asset_id")
  WHERE "is_current" = TRUE;

CREATE OR REPLACE FUNCTION "unit_cost_allocations_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_unit_cost_allocations_updated_at"
  ON "unit_cost_allocations";
CREATE TRIGGER "trg_unit_cost_allocations_updated_at"
  BEFORE UPDATE ON "unit_cost_allocations"
  FOR EACH ROW EXECUTE FUNCTION "unit_cost_allocations_set_updated_at"();


-- =============================================================================
-- 2) cashflow_forecasts
-- =============================================================================

CREATE TABLE IF NOT EXISTS "cashflow_forecasts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "forecast_label" TEXT NOT NULL,
  "scope" TEXT NOT NULL CHECK ("scope" IN ('project', 'company_wide')),
  "project_id" UUID REFERENCES "projects"("id"),

  "forecast_horizon_months" INTEGER NOT NULL,
  "forecast_start_month" DATE NOT NULL,

  "monthly_projections" JSONB NOT NULL,

  "peak_capital_required_minor" BIGINT,
  "peak_required_at_month" DATE,
  "total_inflow_minor" BIGINT,
  "total_outflow_minor" BIGINT,
  "ending_cash_minor" BIGINT,

  "identified_cash_gaps" JSONB,

  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN (
    'draft', 'active', 'archived', 'superseded'
  )),
  "generated_by_agent" BOOLEAN NOT NULL DEFAULT FALSE,

  "approved_by" UUID REFERENCES "app_users"("id"),
  "approved_at" TIMESTAMPTZ,

  "notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Scope is mutually exclusive: company_wide must have project_id NULL,
  -- project must have project_id NOT NULL.
  CONSTRAINT "cashflow_forecasts_scope_xor" CHECK (
    (scope = 'company_wide' AND project_id IS NULL) OR
    (scope = 'project' AND project_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "cashflow_forecasts_scope_idx"
  ON "cashflow_forecasts"("scope");
CREATE INDEX IF NOT EXISTS "cashflow_forecasts_project_idx"
  ON "cashflow_forecasts"("project_id");
CREATE INDEX IF NOT EXISTS "cashflow_forecasts_status_idx"
  ON "cashflow_forecasts"("status");
CREATE INDEX IF NOT EXISTS "cashflow_forecasts_start_idx"
  ON "cashflow_forecasts"("forecast_start_month");

CREATE OR REPLACE FUNCTION "cashflow_forecasts_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_cashflow_forecasts_updated_at"
  ON "cashflow_forecasts";
CREATE TRIGGER "trg_cashflow_forecasts_updated_at"
  BEFORE UPDATE ON "cashflow_forecasts"
  FOR EACH ROW EXECUTE FUNCTION "cashflow_forecasts_set_updated_at"();


-- =============================================================================
-- 3) RLS
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['unit_cost_allocations', 'cashflow_forecasts'])
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
