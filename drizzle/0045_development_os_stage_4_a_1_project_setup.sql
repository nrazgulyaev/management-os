-- =============================================================================
-- 0045 — Development OS · Stage 4.A.1 — Project Setup Foundation
--
-- Land profile + permits lifecycle. Closes the new-project onboarding gap
-- identified in the strategic review.
--
-- Five new internal-only RLS tables:
--   - land_profiles                  one per project, acquisition + sizes + DD
--   - land_payment_schedules         total purchase price + headers
--   - land_payment_installments      individual due payments, link to txns
--   - land_transaction_costs         additional costs around acquisition
--   - project_permits                lifecycle (PBG, SLF, etc.)
--   - project_permit_documents       junction to existing documents table
--
-- Idempotent. Wrapped in BEGIN ... COMMIT.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) land_profiles — one per project (UNIQUE on project_id)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "land_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL UNIQUE
    REFERENCES "projects"("id") ON DELETE CASCADE,

  "acquisition_mode" TEXT NOT NULL,
  "acquisition_mode_notes" TEXT,

  "land_certificate_reference" TEXT,
  "plot_name" TEXT,
  "acquisition_date" DATE,

  "lease_start_date" DATE,
  "lease_expiry_date" DATE,
  "lease_tenure_years" INTEGER,
  "lease_extension_option" BOOLEAN,
  "lease_extension_terms" TEXT,

  "total_land_size_are" NUMERIC(10, 4),
  "total_land_size_sqm" NUMERIC(12, 2),
  "gross_land_area_sqm" NUMERIC(12, 2),
  "net_usable_land_area_sqm" NUMERIC(12, 2),
  "land_per_unit_sqm" NUMERIC(12, 2),

  "road_deductions_sqm" NUMERIC(12, 2),
  "common_area_deductions_sqm" NUMERIC(12, 2),
  "setback_deductions_sqm" NUMERIC(12, 2),

  "zoning_classification" TEXT,
  "zoning_notes" TEXT,
  "topography_notes" TEXT,
  "soil_geotechnical_notes" TEXT,
  "utility_access_notes" TEXT,

  "due_diligence_status" TEXT NOT NULL DEFAULT 'pending',
  "due_diligence_completed_at" DATE,
  "due_diligence_notes" TEXT,

  "responsible_legal_consultant" TEXT,
  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "land_profiles_acquisition_mode_check"
    CHECK ("acquisition_mode" IN (
      'leasehold', 'freehold', 'joint_venture', 'landowner_partnership',
      'nominee', 'revenue_share', 'custom'
    )),
  CONSTRAINT "land_profiles_dd_status_check"
    CHECK ("due_diligence_status" IN (
      'pending', 'in_progress', 'completed', 'issues_identified', 'not_required'
    ))
);

CREATE INDEX IF NOT EXISTS "land_profiles_project_idx"
  ON "land_profiles" ("project_id");
CREATE INDEX IF NOT EXISTS "land_profiles_lease_expiry_idx"
  ON "land_profiles" ("lease_expiry_date")
  WHERE "lease_expiry_date" IS NOT NULL;

-- =============================================================================
-- 2) land_payment_schedules + installments
-- =============================================================================
CREATE TABLE IF NOT EXISTS "land_payment_schedules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "land_profile_id" UUID NOT NULL
    REFERENCES "land_profiles"("id") ON DELETE CASCADE,

  "total_purchase_price_minor" BIGINT NOT NULL
    CHECK ("total_purchase_price_minor" >= 0),
  "currency" TEXT NOT NULL DEFAULT 'USD',

  "upfront_payment_minor" BIGINT NOT NULL DEFAULT 0,
  "balance_payment_minor" BIGINT NOT NULL DEFAULT 0,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "land_payment_schedules_profile_idx"
  ON "land_payment_schedules" ("land_profile_id");

CREATE TABLE IF NOT EXISTS "land_payment_installments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "schedule_id" UUID NOT NULL
    REFERENCES "land_payment_schedules"("id") ON DELETE CASCADE,

  "installment_number" INTEGER NOT NULL,
  "due_date" DATE NOT NULL,
  "amount_minor" BIGINT NOT NULL CHECK ("amount_minor" >= 0),

  "status" TEXT NOT NULL DEFAULT 'pending',
  "paid_date" DATE,
  "paid_amount_minor" BIGINT DEFAULT 0,
  "payment_method" TEXT,
  "counterparty" TEXT,

  "related_transaction_id" UUID
    REFERENCES "dev_transactions"("id") ON DELETE SET NULL,
  -- Forward ref to dev_invoices (Stage 4.A.2). Plain UUID; FK added in 0046
  -- once the target table exists.
  "related_invoice_id" UUID,

  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "land_payment_installments_unique_number"
    UNIQUE ("schedule_id", "installment_number"),
  CONSTRAINT "land_payment_installments_status_check"
    CHECK ("status" IN ('pending', 'paid', 'partial', 'overdue', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS "land_payment_installments_schedule_idx"
  ON "land_payment_installments" ("schedule_id");
CREATE INDEX IF NOT EXISTS "land_payment_installments_due_idx"
  ON "land_payment_installments" ("due_date");
CREATE INDEX IF NOT EXISTS "land_payment_installments_status_idx"
  ON "land_payment_installments" ("status");

-- =============================================================================
-- 3) land_transaction_costs — additional acquisition-related costs
-- =============================================================================
CREATE TABLE IF NOT EXISTS "land_transaction_costs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "land_profile_id" UUID NOT NULL
    REFERENCES "land_profiles"("id") ON DELETE CASCADE,

  "cost_type" TEXT NOT NULL,
  "cost_label" TEXT NOT NULL,

  "planned_amount_minor" BIGINT,
  "actual_amount_minor" BIGINT,
  "currency" TEXT NOT NULL DEFAULT 'USD',

  "due_date" DATE,
  "paid_date" DATE,
  "status" TEXT NOT NULL DEFAULT 'planned',

  "vendor_id" UUID REFERENCES "vendors"("id") ON DELETE SET NULL,
  "related_transaction_id" UUID
    REFERENCES "dev_transactions"("id") ON DELETE SET NULL,

  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "land_transaction_costs_type_check"
    CHECK ("cost_type" IN (
      'lease_tax', 'purchase_tax', 'notary_fee', 'legal_due_diligence',
      'land_survey', 'topographic_survey', 'soil_test', 'brokerage_fee',
      'agent_commission', 'land_clearance', 'access_road_preparation',
      'boundary_marking', 'utility_connection', 'environmental_assessment',
      'custom'
    )),
  CONSTRAINT "land_transaction_costs_status_check"
    CHECK ("status" IN ('planned', 'committed', 'paid', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS "land_transaction_costs_profile_idx"
  ON "land_transaction_costs" ("land_profile_id");
CREATE INDEX IF NOT EXISTS "land_transaction_costs_status_idx"
  ON "land_transaction_costs" ("status");

-- =============================================================================
-- 4) project_permits — PBG / SLF / etc.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "project_permits" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL
    REFERENCES "projects"("id") ON DELETE CASCADE,

  "permit_type" TEXT NOT NULL,
  "permit_label" TEXT NOT NULL,

  "status" TEXT NOT NULL DEFAULT 'planned',

  "preparation_started_at" DATE,
  "submitted_at" DATE,
  "target_approval_date" DATE,
  "received_at" DATE,
  "expires_at" DATE,

  "permit_number" TEXT,
  "issuing_authority" TEXT,

  "planned_cost_minor" BIGINT,
  "actual_cost_minor" BIGINT,
  "currency" TEXT NOT NULL DEFAULT 'USD',

  "responsible_person" TEXT,
  "notes" TEXT,
  "rejection_reason" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "project_permits_type_check"
    CHECK ("permit_type" IN (
      'pbg', 'slf', 'building_license', 'environmental', 'zoning_change',
      'business_license', 'construction_permit', 'utility_connection',
      'land_use_change', 'custom'
    )),
  CONSTRAINT "project_permits_status_check"
    CHECK ("status" IN (
      'planned', 'preparing', 'submitted', 'under_review',
      'approved', 'rejected', 'expired', 'renewed', 'cancelled'
    ))
);

CREATE INDEX IF NOT EXISTS "project_permits_project_idx"
  ON "project_permits" ("project_id");
CREATE INDEX IF NOT EXISTS "project_permits_status_idx"
  ON "project_permits" ("status");
CREATE INDEX IF NOT EXISTS "project_permits_type_idx"
  ON "project_permits" ("permit_type");
CREATE INDEX IF NOT EXISTS "project_permits_expires_idx"
  ON "project_permits" ("expires_at")
  WHERE "expires_at" IS NOT NULL;

-- =============================================================================
-- 5) project_permit_documents — junction to existing documents table
-- =============================================================================
CREATE TABLE IF NOT EXISTS "project_permit_documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "permit_id" UUID NOT NULL
    REFERENCES "project_permits"("id") ON DELETE CASCADE,
  "document_id" UUID NOT NULL
    REFERENCES "documents"("id") ON DELETE CASCADE,
  "document_role" TEXT,
  "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "project_permit_documents_unique"
    UNIQUE ("permit_id", "document_id")
);

CREATE INDEX IF NOT EXISTS "project_permit_documents_permit_idx"
  ON "project_permit_documents" ("permit_id");

-- =============================================================================
-- 6) updated_at triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION "land_profiles_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "land_profiles_updated_at_trg" ON "land_profiles";
CREATE TRIGGER "land_profiles_updated_at_trg"
  BEFORE UPDATE ON "land_profiles"
  FOR EACH ROW EXECUTE FUNCTION "land_profiles_set_updated_at"();

CREATE OR REPLACE FUNCTION "land_payment_schedules_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "land_payment_schedules_updated_at_trg"
  ON "land_payment_schedules";
CREATE TRIGGER "land_payment_schedules_updated_at_trg"
  BEFORE UPDATE ON "land_payment_schedules"
  FOR EACH ROW EXECUTE FUNCTION "land_payment_schedules_set_updated_at"();

CREATE OR REPLACE FUNCTION "land_payment_installments_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "land_payment_installments_updated_at_trg"
  ON "land_payment_installments";
CREATE TRIGGER "land_payment_installments_updated_at_trg"
  BEFORE UPDATE ON "land_payment_installments"
  FOR EACH ROW EXECUTE FUNCTION "land_payment_installments_set_updated_at"();

CREATE OR REPLACE FUNCTION "land_transaction_costs_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "land_transaction_costs_updated_at_trg"
  ON "land_transaction_costs";
CREATE TRIGGER "land_transaction_costs_updated_at_trg"
  BEFORE UPDATE ON "land_transaction_costs"
  FOR EACH ROW EXECUTE FUNCTION "land_transaction_costs_set_updated_at"();

CREATE OR REPLACE FUNCTION "project_permits_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "project_permits_updated_at_trg" ON "project_permits";
CREATE TRIGGER "project_permits_updated_at_trg"
  BEFORE UPDATE ON "project_permits"
  FOR EACH ROW EXECUTE FUNCTION "project_permits_set_updated_at"();

-- =============================================================================
-- 7) RLS — internal-only on all six new tables
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'land_profiles',
      'land_payment_schedules',
      'land_payment_installments',
      'land_transaction_costs',
      'project_permits',
      'project_permit_documents'
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
