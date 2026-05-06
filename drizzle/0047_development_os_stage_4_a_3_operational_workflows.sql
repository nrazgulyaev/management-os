-- =============================================================================
-- 0047 — Development OS · Stage 4.A.3 — Operational Workflows
--
-- Shared cost allocations (multi-project transactions) + Purchase Request
-- → Quotation → PO workflow + configurable approval thresholds.
--
-- Six new internal-only RLS tables:
--   - shared_cost_allocations         per-source-transaction allocation header
--   - shared_cost_allocation_lines    per-project split (DB-enforced 100% sum)
--   - purchase_requests               site-staff request before PO
--   - procurement_quotations          vendor quotes per request
--   - procurement_quotation_lines     quote line items
--   - approval_thresholds             configurable role matrix per amount
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) shared_cost_allocations — header per source transaction
-- =============================================================================
CREATE TABLE IF NOT EXISTS "shared_cost_allocations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "source_transaction_id" UUID UNIQUE NOT NULL
    REFERENCES "dev_transactions"("id") ON DELETE CASCADE,

  "allocation_method" TEXT NOT NULL,
  "allocation_basis" JSONB,

  "status" TEXT NOT NULL DEFAULT 'draft',
  "approved_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "approved_at" TIMESTAMPTZ,

  "notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "shared_cost_allocations_method_check"
    CHECK ("allocation_method" IN (
      'by_floor_area', 'by_land_area', 'by_unit_count', 'by_budget_size',
      'by_revenue_share', 'by_time_spent', 'by_headcount',
      'fixed_percentage', 'manual_split', 'custom_formula'
    )),
  CONSTRAINT "shared_cost_allocations_status_check"
    CHECK ("status" IN ('draft', 'approved', 'applied', 'reversed', 'superseded'))
);

CREATE INDEX IF NOT EXISTS "shared_cost_allocations_source_idx"
  ON "shared_cost_allocations" ("source_transaction_id");
CREATE INDEX IF NOT EXISTS "shared_cost_allocations_status_idx"
  ON "shared_cost_allocations" ("status");

-- =============================================================================
-- 2) shared_cost_allocation_lines + DB-enforced 100% sum trigger
-- =============================================================================
CREATE TABLE IF NOT EXISTS "shared_cost_allocation_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "allocation_id" UUID NOT NULL
    REFERENCES "shared_cost_allocations"("id") ON DELETE CASCADE,

  "project_id" UUID NOT NULL REFERENCES "projects"("id"),
  "percentage" NUMERIC(7, 4) NOT NULL
    CHECK ("percentage" > 0 AND "percentage" <= 100),
  "amount_minor" BIGINT NOT NULL CHECK ("amount_minor" >= 0),
  "currency" TEXT NOT NULL,

  "derivative_transaction_id" UUID
    REFERENCES "dev_transactions"("id") ON DELETE SET NULL,

  "notes" TEXT,

  CONSTRAINT "shared_cost_allocation_lines_unique_project"
    UNIQUE ("allocation_id", "project_id")
);

CREATE INDEX IF NOT EXISTS "shared_cost_allocation_lines_allocation_idx"
  ON "shared_cost_allocation_lines" ("allocation_id");
CREATE INDEX IF NOT EXISTS "shared_cost_allocation_lines_project_idx"
  ON "shared_cost_allocation_lines" ("project_id");

-- DB-level enforcement: percentages must sum to exactly 100% per allocation.
-- DEFERRABLE so a transaction can insert all lines, then check at COMMIT.
CREATE OR REPLACE FUNCTION "check_shared_cost_allocation_sum"()
RETURNS TRIGGER AS $$
DECLARE
  total_pct NUMERIC;
  alloc_id UUID;
BEGIN
  alloc_id := COALESCE(NEW."allocation_id", OLD."allocation_id");
  SELECT SUM("percentage") INTO total_pct
    FROM "shared_cost_allocation_lines"
   WHERE "allocation_id" = alloc_id;
  -- Allow an allocation to exist transiently with zero lines (during
  -- multi-step deletes) — only fail when there ARE lines and they don't
  -- sum to 100%.
  IF total_pct IS NOT NULL AND ABS(total_pct - 100) > 0.001 THEN
    RAISE EXCEPTION 'shared_cost_allocation_lines must sum to exactly 100%% per allocation, got %', total_pct;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_check_shared_cost_allocation_sum"
  ON "shared_cost_allocation_lines";
CREATE CONSTRAINT TRIGGER "trg_check_shared_cost_allocation_sum"
  AFTER INSERT OR UPDATE OR DELETE ON "shared_cost_allocation_lines"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_shared_cost_allocation_sum"();

-- =============================================================================
-- 3) purchase_requests — site staff → procurement
-- =============================================================================
CREATE TABLE IF NOT EXISTS "dev_os_purchase_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "request_code" TEXT UNIQUE NOT NULL,

  "requested_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "project_id" UUID NOT NULL REFERENCES "projects"("id"),
  "unit_id" UUID REFERENCES "villas"("id") ON DELETE SET NULL,
  -- Forward ref to work_packages (Stage 4.C). Plain UUID for now.
  "work_package_id" UUID,

  "material_name" TEXT NOT NULL,
  "material_category" TEXT NOT NULL,
  "description" TEXT,
  "quantity" NUMERIC(12, 4) NOT NULL CHECK ("quantity" > 0),
  "unit_of_measure" TEXT NOT NULL,

  "reason" TEXT NOT NULL,
  "required_by_date" DATE NOT NULL,
  "urgency" TEXT NOT NULL DEFAULT 'normal',

  "estimated_cost_minor" BIGINT,
  "estimated_currency" TEXT DEFAULT 'IDR',
  "preferred_supplier_id" UUID
    REFERENCES "vendors"("id") ON DELETE SET NULL,

  "status" TEXT NOT NULL DEFAULT 'draft',
  "submitted_at" TIMESTAMPTZ,
  "approved_at" TIMESTAMPTZ,
  "approved_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "rejection_reason" TEXT,

  "generated_po_id" UUID
    REFERENCES "material_purchase_orders"("id") ON DELETE SET NULL,

  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "dev_os_purchase_requests_urgency_check"
    CHECK ("urgency" IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT "dev_os_purchase_requests_status_check"
    CHECK ("status" IN (
      'draft', 'submitted', 'approved', 'quotations_in_progress',
      'quotation_selected', 'po_created', 'rejected', 'cancelled'
    ))
);

CREATE INDEX IF NOT EXISTS "dev_os_purchase_requests_project_idx"
  ON "dev_os_purchase_requests" ("project_id");
CREATE INDEX IF NOT EXISTS "dev_os_purchase_requests_status_idx"
  ON "dev_os_purchase_requests" ("status");
CREATE INDEX IF NOT EXISTS "dev_os_purchase_requests_required_idx"
  ON "dev_os_purchase_requests" ("required_by_date");
CREATE INDEX IF NOT EXISTS "dev_os_purchase_requests_requested_by_idx"
  ON "dev_os_purchase_requests" ("requested_by");

-- =============================================================================
-- 4) procurement_quotations — multiple per request
-- =============================================================================
CREATE TABLE IF NOT EXISTS "procurement_quotations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "purchase_request_id" UUID NOT NULL
    REFERENCES "dev_os_purchase_requests"("id") ON DELETE CASCADE,
  "vendor_id" UUID NOT NULL REFERENCES "vendors"("id"),

  "quotation_number" TEXT,
  "quoted_at" DATE NOT NULL DEFAULT CURRENT_DATE,
  "validity_until" DATE,

  "total_amount_minor" BIGINT NOT NULL CHECK ("total_amount_minor" > 0),
  "currency" TEXT NOT NULL DEFAULT 'IDR',

  "payment_terms" TEXT,
  "delivery_estimated_date" DATE,
  "delivery_terms" TEXT,

  "quotation_document_id" UUID
    REFERENCES "documents"("id") ON DELETE SET NULL,

  "status" TEXT NOT NULL DEFAULT 'received',
  "selected_at" TIMESTAMPTZ,
  "selected_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "selection_reason" TEXT,
  "rejection_reason" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "procurement_quotations_unique_vendor_per_request"
    UNIQUE ("purchase_request_id", "vendor_id"),
  CONSTRAINT "procurement_quotations_status_check"
    CHECK ("status" IN (
      'received', 'under_review', 'selected', 'rejected', 'expired'
    ))
);

CREATE INDEX IF NOT EXISTS "procurement_quotations_request_idx"
  ON "procurement_quotations" ("purchase_request_id");
CREATE INDEX IF NOT EXISTS "procurement_quotations_vendor_idx"
  ON "procurement_quotations" ("vendor_id");
CREATE INDEX IF NOT EXISTS "procurement_quotations_status_idx"
  ON "procurement_quotations" ("status");

-- Only one selected quotation per request (partial unique).
CREATE UNIQUE INDEX IF NOT EXISTS "procurement_quotations_selected_unique"
  ON "procurement_quotations" ("purchase_request_id")
  WHERE "status" = 'selected';

-- =============================================================================
-- 5) procurement_quotation_lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS "procurement_quotation_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "quotation_id" UUID NOT NULL
    REFERENCES "procurement_quotations"("id") ON DELETE CASCADE,

  "line_number" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" NUMERIC(12, 4) NOT NULL,
  "unit_of_measure" TEXT NOT NULL,
  "unit_price_minor" BIGINT NOT NULL,
  "line_total_minor" BIGINT
    GENERATED ALWAYS AS (("quantity" * "unit_price_minor")::BIGINT) STORED,

  "notes" TEXT,

  CONSTRAINT "procurement_quotation_lines_unique"
    UNIQUE ("quotation_id", "line_number")
);

CREATE INDEX IF NOT EXISTS "procurement_quotation_lines_quotation_idx"
  ON "procurement_quotation_lines" ("quotation_id");

-- =============================================================================
-- 6) approval_thresholds — configurable matrix
-- =============================================================================
CREATE TABLE IF NOT EXISTS "approval_thresholds" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "threshold_type" TEXT NOT NULL,

  "amount_minor_min" BIGINT NOT NULL DEFAULT 0,
  "amount_minor_max" BIGINT,
  "currency" TEXT NOT NULL DEFAULT 'USD',

  "required_role" TEXT NOT NULL,
  "required_approver_count" INTEGER NOT NULL DEFAULT 1,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "approval_thresholds_type_check"
    CHECK ("threshold_type" IN (
      'purchase_request', 'change_order', 'budget_overrun',
      'discount', 'distribution', 'capital_call', 'custom'
    )),
  CONSTRAINT "approval_thresholds_role_check"
    CHECK ("required_role" IN (
      'auto_approved', 'procurement_manager', 'project_manager',
      'finance_manager', 'director', 'investor_approval', 'reserved_matter'
    ))
);

CREATE INDEX IF NOT EXISTS "approval_thresholds_type_idx"
  ON "approval_thresholds" ("threshold_type");
CREATE INDEX IF NOT EXISTS "approval_thresholds_active_idx"
  ON "approval_thresholds" ("is_active");

-- =============================================================================
-- 7) Default approval thresholds (idempotent UPSERT-ish via existence check)
-- =============================================================================
INSERT INTO "approval_thresholds" (
  "threshold_type", "amount_minor_min", "amount_minor_max",
  "currency", "required_role", "notes"
)
SELECT * FROM (VALUES
  ('purchase_request', 0::BIGINT, 50000::BIGINT, 'USD', 'auto_approved',
   'Under $500 — auto-approved'),
  ('purchase_request', 50000::BIGINT, 500000::BIGINT, 'USD', 'project_manager',
   '$500-$5000 — PM approval'),
  ('purchase_request', 500000::BIGINT, 2500000::BIGINT, 'USD', 'director',
   '$5000-$25000 — director approval'),
  ('purchase_request', 2500000::BIGINT, NULL::BIGINT, 'USD', 'investor_approval',
   '$25000+ — investor approval'),
  ('change_order', 0::BIGINT, 100000::BIGINT, 'USD', 'project_manager', NULL),
  ('change_order', 100000::BIGINT, NULL::BIGINT, 'USD', 'director', NULL),
  ('distribution', 0::BIGINT, NULL::BIGINT, 'USD', 'reserved_matter',
   'All distributions require reserved matter approval'),
  ('discount', 0::BIGINT, 50000::BIGINT, 'USD', 'project_manager', NULL),
  ('discount', 50000::BIGINT, NULL::BIGINT, 'USD', 'director', NULL)
) AS v("threshold_type", "amount_minor_min", "amount_minor_max",
       "currency", "required_role", "notes")
WHERE NOT EXISTS (
  SELECT 1 FROM "approval_thresholds" t
  WHERE t."threshold_type" = v."threshold_type"
    AND t."amount_minor_min" = v."amount_minor_min"
    AND t."currency" = v."currency"
    AND COALESCE(t."amount_minor_max", -1) = COALESCE(v."amount_minor_max", -1)
);

-- =============================================================================
-- 8) updated_at triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION "shared_cost_allocations_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "shared_cost_allocations_updated_at_trg"
  ON "shared_cost_allocations";
CREATE TRIGGER "shared_cost_allocations_updated_at_trg"
  BEFORE UPDATE ON "shared_cost_allocations"
  FOR EACH ROW EXECUTE FUNCTION "shared_cost_allocations_set_updated_at"();

CREATE OR REPLACE FUNCTION "dev_os_purchase_requests_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "dev_os_purchase_requests_updated_at_trg" ON "dev_os_purchase_requests";
CREATE TRIGGER "dev_os_purchase_requests_updated_at_trg"
  BEFORE UPDATE ON "dev_os_purchase_requests"
  FOR EACH ROW EXECUTE FUNCTION "dev_os_purchase_requests_set_updated_at"();

CREATE OR REPLACE FUNCTION "procurement_quotations_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "procurement_quotations_updated_at_trg"
  ON "procurement_quotations";
CREATE TRIGGER "procurement_quotations_updated_at_trg"
  BEFORE UPDATE ON "procurement_quotations"
  FOR EACH ROW EXECUTE FUNCTION "procurement_quotations_set_updated_at"();

CREATE OR REPLACE FUNCTION "approval_thresholds_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "approval_thresholds_updated_at_trg" ON "approval_thresholds";
CREATE TRIGGER "approval_thresholds_updated_at_trg"
  BEFORE UPDATE ON "approval_thresholds"
  FOR EACH ROW EXECUTE FUNCTION "approval_thresholds_set_updated_at"();

-- =============================================================================
-- 9) RLS — internal-only on all six new tables
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'shared_cost_allocations',
      'shared_cost_allocation_lines',
      'dev_os_purchase_requests',
      'procurement_quotations',
      'procurement_quotation_lines',
      'approval_thresholds'
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
