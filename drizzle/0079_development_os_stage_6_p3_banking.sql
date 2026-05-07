-- =============================================================================
-- 0079 — Development OS · Stage 6.P3.A — Banking Foundation
--
-- 4 new tables — banking core for Stage 6.P3:
--   - bank_connections        per-bank-account configuration. One row per
--                             external account (Revolut, Wise, Mandiri,
--                             BCA, Plaid, manual). Links to the existing
--                             `dev_bank_accounts` row that the connection
--                             feeds. Encrypted credentials.
--   - bank_transactions       imported transactions. Idempotent ingestion
--                             via UNIQUE (bank_connection_id,
--                             external_transaction_id). Holds match status,
--                             auto-category suggestion, FX detail.
--   - statement_imports       uploaded statement files (CSV/OFX/PDF/MT940/
--                             JSON) with parse status, preview counts,
--                             column mapping for CSV.
--   - reconciliation_rules    operator-defined auto-match rules — trigger
--                             predicate (description regex / amount range /
--                             counterparty match) + action (assign category
--                             / map to vendor / link to invoice strategy).
--
-- FK references use the codebase's actual physical table names:
--   - dev_bank_accounts (not "bank_accounts" — Stage 4.A naming)
--   - dev_cost_categories (not "cost_categories")
--   - dev_transactions (not "transactions")
--   - invoices (matches), vendors (matches), app_users (matches),
--     organizations (matches).
--
-- RLS: per-org isolation via is_in_user_organization() (Stage 5.J helper).
-- Uses FOREACH IN ARRAY (per the migration 0075 lesson). Idempotent.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) bank_connections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "bank_connections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  -- Provider identification.
  "provider" TEXT NOT NULL CHECK ("provider" IN (
    'revolut', 'wise', 'mandiri', 'bca', 'plaid', 'manual', 'other'
  )),

  -- Optional link to the existing `dev_bank_accounts` row that this
  -- connection feeds. SET NULL on internal-account deletion so the
  -- connection record + its transaction history survive the unlink.
  "internal_bank_account_id" UUID REFERENCES "dev_bank_accounts"("id") ON DELETE SET NULL,

  "external_account_id" TEXT NOT NULL,
  "account_name" TEXT,
  "account_type" TEXT CHECK ("account_type" IN (
    'checking', 'savings', 'business', 'multi_currency', 'crypto'
  )),
  "currency" TEXT NOT NULL,

  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN (
    'pending', 'connecting', 'active', 'paused', 'error', 'archived'
  )),

  -- Credentials encrypted via STAY_LINK_KMS_SECRET (P1.B
  -- credentials-crypto). NULL until the operator finishes the
  -- "Connect bank" wizard.
  "credentials" JSONB,

  -- Sync configuration.
  "auto_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
  "sync_frequency_minutes" INTEGER NOT NULL DEFAULT 60,
  "last_synced_at" TIMESTAMPTZ,
  "last_sync_status" TEXT,
  "last_sync_error" TEXT,

  -- Operator preference for manual statement uploads.
  "preferred_statement_format" TEXT CHECK ("preferred_statement_format" IN (
    'csv', 'ofx', 'pdf', 'mt940', 'json'
  )),

  -- Audit.
  "connected_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "connected_at" TIMESTAMPTZ,
  "archived_at" TIMESTAMPTZ,
  "archive_reason" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("organization_id", "provider", "external_account_id")
);

CREATE INDEX IF NOT EXISTS "bank_connections_org_idx"
  ON "bank_connections"("organization_id");
CREATE INDEX IF NOT EXISTS "bank_connections_status_idx"
  ON "bank_connections"("status") WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "bank_connections_provider_idx"
  ON "bank_connections"("provider");

-- -----------------------------------------------------------------------------
-- 2) bank_transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "bank_transactions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "bank_connection_id" UUID NOT NULL REFERENCES "bank_connections"("id") ON DELETE CASCADE,

  -- External identifiers — idempotency key for ingestion.
  "external_transaction_id" TEXT NOT NULL,
  "external_reference" TEXT,

  -- Dates.
  "transaction_date" DATE NOT NULL,
  "value_date" DATE,
  "booking_date" DATE,

  -- Amount in minor units. Sign convention: positive = credit, negative
  -- = debit. Provider parsers normalize to this convention.
  "amount_minor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,

  -- Original (pre-FX) amount when the booking currency differs from the
  -- account currency.
  "original_amount_minor" BIGINT,
  "original_currency" TEXT,
  "fx_rate" NUMERIC(20, 10),

  "description" TEXT NOT NULL,
  "counterparty_name" TEXT,
  "counterparty_account" TEXT,
  "counterparty_iban" TEXT,
  "counterparty_swift" TEXT,
  "counterparty_country" TEXT,

  -- Categorization.
  "auto_category" TEXT,
  "category_confidence" NUMERIC(3, 2),
  "category_id" UUID REFERENCES "dev_cost_categories"("id") ON DELETE SET NULL,
  "manually_categorized" BOOLEAN NOT NULL DEFAULT false,
  "categorized_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "categorized_at" TIMESTAMPTZ,

  -- Reconciliation linkage.
  "matched_invoice_id" UUID REFERENCES "invoices"("id") ON DELETE SET NULL,
  "matched_transaction_id" UUID REFERENCES "dev_transactions"("id") ON DELETE SET NULL,
  "match_status" TEXT NOT NULL DEFAULT 'unmatched' CHECK ("match_status" IN (
    'unmatched', 'auto_matched', 'manually_matched',
    'partial_match', 'mismatch_flagged', 'ignored'
  )),
  "match_confidence" NUMERIC(3, 2),
  "matched_at" TIMESTAMPTZ,
  "matched_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,

  -- Source / provenance.
  "import_source" TEXT NOT NULL CHECK ("import_source" IN (
    'api', 'csv_upload', 'ofx_upload', 'pdf_upload', 'email_parsed', 'manual_entry'
  )),
  "import_job_id" UUID,
  "raw_payload" JSONB,

  -- Lifecycle flags.
  "is_pending" BOOLEAN NOT NULL DEFAULT false,
  "is_disputed" BOOLEAN NOT NULL DEFAULT false,
  "is_reversed" BOOLEAN NOT NULL DEFAULT false,
  "reversal_of_id" UUID REFERENCES "bank_transactions"("id"),

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency: same external transaction can't be imported twice.
  UNIQUE ("bank_connection_id", "external_transaction_id")
);

CREATE INDEX IF NOT EXISTS "bank_transactions_connection_idx"
  ON "bank_transactions"("bank_connection_id");
CREATE INDEX IF NOT EXISTS "bank_transactions_date_idx"
  ON "bank_transactions"("transaction_date" DESC);
CREATE INDEX IF NOT EXISTS "bank_transactions_unmatched_idx"
  ON "bank_transactions"("match_status") WHERE "match_status" = 'unmatched';
CREATE INDEX IF NOT EXISTS "bank_transactions_uncategorized_idx"
  ON "bank_transactions"("category_id") WHERE "category_id" IS NULL;
CREATE INDEX IF NOT EXISTS "bank_transactions_org_idx"
  ON "bank_transactions"("organization_id");

-- -----------------------------------------------------------------------------
-- 3) statement_imports
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "statement_imports" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "bank_connection_id" UUID NOT NULL REFERENCES "bank_connections"("id") ON DELETE CASCADE,

  -- Human-readable code, e.g. 'STMT-2026-0001'. Useful for support /
  -- audit references.
  "import_code" TEXT NOT NULL UNIQUE,

  "format" TEXT NOT NULL CHECK ("format" IN (
    'csv', 'ofx', 'pdf', 'mt940', 'json'
  )),
  "filename" TEXT,
  "file_size_bytes" BIGINT,
  "source_document_id" UUID,
  "source_content_encrypted" TEXT,

  -- Period covered by the statement (parsed during preview).
  "statement_period_start" DATE,
  "statement_period_end" DATE,

  -- Counters populated as parse + import progress.
  "total_rows" INTEGER,
  "transactions_created" INTEGER NOT NULL DEFAULT 0,
  "transactions_skipped_duplicate" INTEGER NOT NULL DEFAULT 0,
  "rows_failed" INTEGER NOT NULL DEFAULT 0,

  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN (
    'pending', 'parsing', 'preview_ready', 'importing',
    'completed', 'failed', 'cancelled'
  )),
  "error_log" JSONB,

  -- For CSV: { "date": "Date", "amount": "Amount", ... } operator chose.
  "column_mapping" JSONB,

  -- Audit.
  "uploaded_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "statement_imports_connection_idx"
  ON "statement_imports"("bank_connection_id");
CREATE INDEX IF NOT EXISTS "statement_imports_status_idx"
  ON "statement_imports"("status");
CREATE INDEX IF NOT EXISTS "statement_imports_org_idx"
  ON "statement_imports"("organization_id");

-- -----------------------------------------------------------------------------
-- 4) reconciliation_rules
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "reconciliation_rules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  "name" TEXT NOT NULL,
  "description" TEXT,

  "match_type" TEXT NOT NULL CHECK ("match_type" IN (
    'description_contains', 'description_regex', 'counterparty_match',
    'amount_range', 'amount_exact', 'date_range_match'
  )),
  "match_config" JSONB NOT NULL,

  -- Action(s) — any combination may apply.
  "auto_assign_category_id" UUID REFERENCES "dev_cost_categories"("id") ON DELETE SET NULL,
  "auto_match_to_vendor_id" UUID REFERENCES "vendors"("id") ON DELETE SET NULL,
  "auto_match_to_invoice_strategy" TEXT CHECK ("auto_match_to_invoice_strategy" IN (
    'amount_only', 'amount_and_date', 'amount_date_vendor', 'fuzzy_description'
  )),

  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "match_count" INTEGER NOT NULL DEFAULT 0,
  "last_matched_at" TIMESTAMPTZ,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "reconciliation_rules_org_idx"
  ON "reconciliation_rules"("organization_id");
CREATE INDEX IF NOT EXISTS "reconciliation_rules_active_idx"
  ON "reconciliation_rules"("is_active", "priority");

-- -----------------------------------------------------------------------------
-- 5) updated_at triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "banking_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_bank_connections_updated_at" ON "bank_connections";
CREATE TRIGGER "trg_bank_connections_updated_at"
  BEFORE UPDATE ON "bank_connections"
  FOR EACH ROW EXECUTE FUNCTION "banking_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_bank_transactions_updated_at" ON "bank_transactions";
CREATE TRIGGER "trg_bank_transactions_updated_at"
  BEFORE UPDATE ON "bank_transactions"
  FOR EACH ROW EXECUTE FUNCTION "banking_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_statement_imports_updated_at" ON "statement_imports";
CREATE TRIGGER "trg_statement_imports_updated_at"
  BEFORE UPDATE ON "statement_imports"
  FOR EACH ROW EXECUTE FUNCTION "banking_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_reconciliation_rules_updated_at" ON "reconciliation_rules";
CREATE TRIGGER "trg_reconciliation_rules_updated_at"
  BEFORE UPDATE ON "reconciliation_rules"
  FOR EACH ROW EXECUTE FUNCTION "banking_set_updated_at"();

-- -----------------------------------------------------------------------------
-- 6) RLS — per-org isolation via is_in_user_organization() (Stage 5.J helper).
--
-- Uses FOREACH t IN ARRAY ARRAY[...] per the migration 0075 lesson —
-- Postgres versions vary on FOR ... IN SELECT unnest(...) syntax.
-- Tests assert this pattern explicitly so future contributors can't regress.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bank_connections',
    'bank_transactions',
    'statement_imports',
    'reconciliation_rules'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS org_isolation ON %I; '
      'CREATE POLICY org_isolation ON %I FOR ALL '
      'USING (public.is_in_user_organization(organization_id)) '
      'WITH CHECK (public.is_in_user_organization(organization_id));',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
