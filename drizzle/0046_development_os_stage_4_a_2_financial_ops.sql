-- =============================================================================
-- 0046 — Development OS · Stage 4.A.2 — Financial Operations
--
-- Configurable tax types + invoice entity split. Closes the bookkeeper
-- daily-work gap from the strategic review.
--
-- Five new internal-only RLS tables + dev_transactions extension:
--   - tax_types                   operator-configurable (NOT hardcoded)
--   - tax_period_reports          monthly/quarterly aggregations
--   - dev_invoices                vendor bills, milestone invoices, capital calls
--   - dev_invoice_lines           per-line categorisation + tax
--   - (dev_transactions ALTER)    add tax_type_id, tax_amount_minor, etc.
--
-- IMPORTANT: existing `capital_commitments` is UNTOUCHED. Commitments
-- represent capital pledges; the new `dev_invoices` is for vendor bills,
-- milestone invoices to buyers, capital-call invoices to investors. They
-- live in parallel.
--
-- Also adds the deferred FK from `land_payment_installments.related_invoice_id`
-- → `dev_invoices.id` (declared as plain UUID in 0045 because target table
-- didn't exist yet).
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) tax_types — operator-configurable
-- =============================================================================
CREATE TABLE IF NOT EXISTS "tax_types" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "type_key" TEXT UNIQUE NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT,

  "rate_percentage" NUMERIC(7, 4) NOT NULL
    CHECK ("rate_percentage" >= 0 AND "rate_percentage" <= 100),
  "is_included_in_amount" BOOLEAN NOT NULL DEFAULT FALSE,

  "applies_to_transaction_types" TEXT[],
  "applies_to_categories" UUID[],
  "excluded_categories" UUID[],

  "payable_by" TEXT NOT NULL,
  "reporting_period" TEXT NOT NULL DEFAULT 'monthly',
  "reporting_authority" TEXT,

  "country_code" TEXT DEFAULT 'ID',
  "region_code" TEXT,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "effective_from" DATE NOT NULL DEFAULT CURRENT_DATE,
  "effective_until" DATE,

  "ai_classification_hint" TEXT,

  "notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "tax_types_payable_by_check"
    CHECK ("payable_by" IN ('company', 'supplier', 'buyer', 'investor', 'split')),
  CONSTRAINT "tax_types_reporting_period_check"
    CHECK ("reporting_period" IN ('monthly', 'quarterly', 'annual', 'on_demand'))
);

CREATE INDEX IF NOT EXISTS "tax_types_active_idx" ON "tax_types" ("is_active");
CREATE INDEX IF NOT EXISTS "tax_types_country_idx" ON "tax_types" ("country_code");

-- =============================================================================
-- 2) Extend dev_transactions with tax fields
-- =============================================================================
ALTER TABLE "dev_transactions"
  ADD COLUMN IF NOT EXISTS "tax_type_id" UUID
    REFERENCES "tax_types"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "tax_amount_minor" BIGINT,
  ADD COLUMN IF NOT EXISTS "is_tax_included" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "tax_classification_status" TEXT NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS "tax_document_id" UUID
    REFERENCES "documents"("id") ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE "dev_transactions"
    DROP CONSTRAINT IF EXISTS "dev_transactions_tax_classification_status_check";
  ALTER TABLE "dev_transactions"
    ADD CONSTRAINT "dev_transactions_tax_classification_status_check"
    CHECK ("tax_classification_status" IN (
      'unclassified', 'classified', 'reviewed', 'flagged_missing_doc', 'tax_exempt'
    ));
END $$;

CREATE INDEX IF NOT EXISTS "dev_transactions_tax_type_idx"
  ON "dev_transactions" ("tax_type_id");
CREATE INDEX IF NOT EXISTS "dev_transactions_tax_status_idx"
  ON "dev_transactions" ("tax_classification_status");

-- =============================================================================
-- 3) tax_period_reports — aggregated reporting
-- =============================================================================
CREATE TABLE IF NOT EXISTS "tax_period_reports" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "tax_type_id" UUID NOT NULL REFERENCES "tax_types"("id"),
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,

  "total_taxable_amount_minor" BIGINT NOT NULL DEFAULT 0,
  "total_tax_amount_minor" BIGINT NOT NULL DEFAULT 0,
  "transaction_count" INTEGER NOT NULL DEFAULT 0,
  "unclassified_transaction_count" INTEGER NOT NULL DEFAULT 0,

  "status" TEXT NOT NULL DEFAULT 'draft',
  "finalized_at" TIMESTAMPTZ,
  "finalized_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "submitted_at" TIMESTAMPTZ,

  "notes" TEXT,

  "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "tax_period_reports_unique"
    UNIQUE ("tax_type_id", "period_start", "period_end"),
  CONSTRAINT "tax_period_reports_status_check"
    CHECK ("status" IN ('draft', 'finalized', 'submitted', 'amended', 'archived'))
);

CREATE INDEX IF NOT EXISTS "tax_period_reports_period_idx"
  ON "tax_period_reports" ("period_start", "period_end");
CREATE INDEX IF NOT EXISTS "tax_period_reports_status_idx"
  ON "tax_period_reports" ("status");

-- =============================================================================
-- 4) dev_invoices — invoice entity split
--
--   The existing `capital_commitments` table is intentionally UNTOUCHED.
--   Commitments represent capital pledges from investors; this new
--   `dev_invoices` table is for: vendor bills (payable), milestone
--   invoices to buyers (receivable), and capital-call invoices to
--   investors (investor_call). They live in parallel.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "dev_invoices" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "invoice_number" TEXT NOT NULL,
  "external_reference" TEXT,

  "invoice_type" TEXT NOT NULL,

  -- Parties (nullable; one of vendor / buyer_contact / investor will be set
  -- depending on invoice_type).
  "vendor_id" UUID REFERENCES "vendors"("id") ON DELETE SET NULL,
  "buyer_contact_id" UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "investor_id" UUID REFERENCES "investors"("id") ON DELETE SET NULL,
  "project_id" UUID REFERENCES "projects"("id") ON DELETE SET NULL,
  -- The schema's "units" table is `villas` in this codebase.
  "unit_id" UUID REFERENCES "villas"("id") ON DELETE SET NULL,

  "related_po_id" UUID
    REFERENCES "material_purchase_orders"("id") ON DELETE SET NULL,
  -- Capital commitment is `capital_commitments` in this codebase.
  "related_commitment_id" UUID
    REFERENCES "capital_commitments"("id") ON DELETE SET NULL,
  -- Forward ref to a future contracts entity (Stage 4.B/C). Plain UUID for now.
  "related_contract_id" UUID,
  "related_land_installment_id" UUID
    REFERENCES "land_payment_installments"("id") ON DELETE SET NULL,
  "related_permit_id" UUID
    REFERENCES "project_permits"("id") ON DELETE SET NULL,

  "issue_date" DATE NOT NULL,
  "due_date" DATE NOT NULL,

  "subtotal_minor" BIGINT NOT NULL CHECK ("subtotal_minor" >= 0),
  "tax_total_minor" BIGINT NOT NULL DEFAULT 0,
  "total_minor" BIGINT NOT NULL CHECK ("total_minor" >= 0),
  "paid_minor" BIGINT NOT NULL DEFAULT 0,
  "outstanding_minor" BIGINT
    GENERATED ALWAYS AS ("total_minor" - "paid_minor") STORED,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "fx_rate_to_usd" NUMERIC(15, 8),

  "status" TEXT NOT NULL DEFAULT 'draft',
  "status_changed_at" TIMESTAMPTZ,

  "tax_type_id" UUID REFERENCES "tax_types"("id") ON DELETE SET NULL,
  "tax_classification_notes" TEXT,

  "payment_terms" TEXT,

  "primary_document_id" UUID
    REFERENCES "documents"("id") ON DELETE SET NULL,

  "notes" TEXT,
  "internal_notes" TEXT,

  "created_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "dev_invoices_unique_number_per_project"
    UNIQUE ("invoice_number", "project_id"),
  CONSTRAINT "dev_invoices_type_check"
    CHECK ("invoice_type" IN (
      'payable', 'receivable', 'investor_call', 'internal'
    )),
  CONSTRAINT "dev_invoices_status_check"
    CHECK ("status" IN (
      'draft', 'issued', 'partial_paid', 'paid', 'overdue',
      'disputed', 'cancelled', 'voided'
    ))
);

CREATE INDEX IF NOT EXISTS "dev_invoices_vendor_idx" ON "dev_invoices" ("vendor_id");
CREATE INDEX IF NOT EXISTS "dev_invoices_buyer_idx" ON "dev_invoices" ("buyer_contact_id");
CREATE INDEX IF NOT EXISTS "dev_invoices_investor_idx" ON "dev_invoices" ("investor_id");
CREATE INDEX IF NOT EXISTS "dev_invoices_project_idx" ON "dev_invoices" ("project_id");
CREATE INDEX IF NOT EXISTS "dev_invoices_status_idx" ON "dev_invoices" ("status");
CREATE INDEX IF NOT EXISTS "dev_invoices_due_date_idx"
  ON "dev_invoices" ("due_date")
  WHERE "status" NOT IN ('paid', 'cancelled', 'voided');
CREATE INDEX IF NOT EXISTS "dev_invoices_issued_idx"
  ON "dev_invoices" ("issue_date" DESC);

-- =============================================================================
-- 5) dev_invoice_lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS "dev_invoice_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_id" UUID NOT NULL
    REFERENCES "dev_invoices"("id") ON DELETE CASCADE,

  "line_number" INTEGER NOT NULL,
  "description" TEXT NOT NULL,

  "quantity" NUMERIC(12, 4) DEFAULT 1,
  "unit_of_measure" TEXT,
  "unit_price_minor" BIGINT NOT NULL,
  "line_subtotal_minor" BIGINT
    GENERATED ALWAYS AS (("quantity" * "unit_price_minor")::BIGINT) STORED,

  "cost_category_id" UUID
    REFERENCES "dev_cost_categories"("id") ON DELETE SET NULL,
  "unit_id" UUID REFERENCES "villas"("id") ON DELETE SET NULL,
  -- Forward ref to work_packages (Stage 4.C). Plain UUID for now.
  "work_package_id" UUID,

  "tax_type_id" UUID REFERENCES "tax_types"("id") ON DELETE SET NULL,
  "tax_amount_minor" BIGINT DEFAULT 0,
  "is_tax_included" BOOLEAN DEFAULT FALSE,

  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "dev_invoice_lines_unique"
    UNIQUE ("invoice_id", "line_number")
);

CREATE INDEX IF NOT EXISTS "dev_invoice_lines_invoice_idx"
  ON "dev_invoice_lines" ("invoice_id");
CREATE INDEX IF NOT EXISTS "dev_invoice_lines_category_idx"
  ON "dev_invoice_lines" ("cost_category_id");

-- =============================================================================
-- 6) Add the deferred FK from land_payment_installments.related_invoice_id
--    → dev_invoices.id. This was declared as plain UUID in 0045 because the
--    target didn't exist yet.
-- =============================================================================
DO $$
BEGIN
  ALTER TABLE "land_payment_installments"
    DROP CONSTRAINT IF EXISTS "land_payment_installments_related_invoice_fk";
  ALTER TABLE "land_payment_installments"
    ADD CONSTRAINT "land_payment_installments_related_invoice_fk"
    FOREIGN KEY ("related_invoice_id")
    REFERENCES "dev_invoices"("id") ON DELETE SET NULL;
END $$;

-- =============================================================================
-- 7) updated_at triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION "tax_types_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "tax_types_updated_at_trg" ON "tax_types";
CREATE TRIGGER "tax_types_updated_at_trg"
  BEFORE UPDATE ON "tax_types"
  FOR EACH ROW EXECUTE FUNCTION "tax_types_set_updated_at"();

CREATE OR REPLACE FUNCTION "tax_period_reports_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "tax_period_reports_updated_at_trg" ON "tax_period_reports";
CREATE TRIGGER "tax_period_reports_updated_at_trg"
  BEFORE UPDATE ON "tax_period_reports"
  FOR EACH ROW EXECUTE FUNCTION "tax_period_reports_set_updated_at"();

CREATE OR REPLACE FUNCTION "dev_invoices_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "dev_invoices_updated_at_trg" ON "dev_invoices";
CREATE TRIGGER "dev_invoices_updated_at_trg"
  BEFORE UPDATE ON "dev_invoices"
  FOR EACH ROW EXECUTE FUNCTION "dev_invoices_set_updated_at"();

CREATE OR REPLACE FUNCTION "dev_invoice_lines_set_updated_at"()
RETURNS TRIGGER AS $$ BEGIN NEW."updated_at" := now(); RETURN NEW; END; $$
LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "dev_invoice_lines_updated_at_trg" ON "dev_invoice_lines";
CREATE TRIGGER "dev_invoice_lines_updated_at_trg"
  BEFORE UPDATE ON "dev_invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION "dev_invoice_lines_set_updated_at"();

-- =============================================================================
-- 8) RLS — internal-only on the four new tables
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'tax_types',
      'tax_period_reports',
      'dev_invoices',
      'dev_invoice_lines'
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
