-- =============================================================================
-- 0037 — Development OS · Stage 2.3
--   Investor capital cluster (7 tables) + Development finance ledger cluster
--   (8 tables, dev_* prefixed). 15 new tables in total.
--
-- All money in BIGINT minor units of an explicit currency. USD is canonical
-- for cross-investor reporting; per-transaction _usd_minor + fx_rate snapshot
-- locks the conversion at event time so historical reports are reproducible.
--
-- Every table ENABLE+FORCE RLS with internal_read/internal_write policies via
-- public.is_internal_user(). Investor portal (Stage 2.3.C) will add parallel
-- investor_can_see_self() policies in a follow-up migration step within the
-- same stage; the placeholder is the contact_id column and the
-- linkage path documented in development-os-architecture.md §Stage 2.3.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every constraint wrapped in
-- DO $$ ... EXCEPTION WHEN duplicate_object. Wrapped in BEGIN; ... COMMIT;.
-- All FKs are ON DELETE RESTRICT to preserve audit trail.
--
-- See docs/development-os-architecture.md §"Stage 2.3 — Investor capital +
-- Development finance" for the full schema contract and architectural
-- decisions.
-- =============================================================================

BEGIN;

-- =============================================================================
-- INVESTOR CAPITAL CLUSTER
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) investors — legal/personal entity providing capital
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "investors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "investor_code" text UNIQUE NOT NULL,
  "investor_type" text NOT NULL,
  "legal_name" text NOT NULL,
  "legal_entity_type" text,
  "tax_residency" text,
  "primary_currency" text NOT NULL DEFAULT 'USD',
  "reporting_language" text NOT NULL DEFAULT 'en',
  "contact_email" text,
  "contact_phone" text,
  "notes" text,
  "status" text NOT NULL DEFAULT 'active',
  "onboarded_at" timestamptz NOT NULL DEFAULT now(),
  "exited_at" timestamptz,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "investors" ADD CONSTRAINT investors_type_check
    CHECK ("investor_type" IN ('gp','lp_private','lp_institutional','landowner_jv'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "investors" ADD CONSTRAINT investors_currency_check
    CHECK ("primary_currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "investors" ADD CONSTRAINT investors_language_check
    CHECK ("reporting_language" IN ('en','ru','id','zh'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "investors" ADD CONSTRAINT investors_status_check
    CHECK ("status" IN ('active','inactive','exited'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS investors_status_idx ON "investors" ("status");
CREATE INDEX IF NOT EXISTS investors_type_idx ON "investors" ("investor_type");
CREATE INDEX IF NOT EXISTS investors_contact_idx ON "investors" ("contact_id");

-- -----------------------------------------------------------------------------
-- 2) capital_commitments — investor x project, negotiated terms
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "capital_commitments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "investor_id" uuid NOT NULL REFERENCES "investors"("id") ON DELETE RESTRICT,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE RESTRICT,
  "commitment_code" text UNIQUE NOT NULL,
  "committed_amount_minor" bigint NOT NULL,
  "committed_currency" text NOT NULL,
  "committed_amount_usd_minor" bigint NOT NULL,
  "fx_rate_at_commitment" numeric(20, 8) NOT NULL,
  "profit_share_percent" numeric(7, 4) NOT NULL,
  "capital_return_priority" integer NOT NULL DEFAULT 1,
  "is_landowner_jv" boolean NOT NULL DEFAULT false,
  "landowner_asset_value_minor" bigint,
  "landowner_asset_currency" text,
  "status" text NOT NULL DEFAULT 'active',
  "signed_at" date,
  "agreement_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "capital_commitments" ADD CONSTRAINT commitments_currency_check
    CHECK ("committed_currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "capital_commitments" ADD CONSTRAINT commitments_landowner_currency_check
    CHECK ("landowner_asset_currency" IS NULL
      OR "landowner_asset_currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "capital_commitments" ADD CONSTRAINT commitments_status_check
    CHECK ("status" IN ('active','fully_called','closed','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "capital_commitments" ADD CONSTRAINT commitments_profit_range_check
    CHECK ("profit_share_percent" >= 0 AND "profit_share_percent" <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "capital_commitments" ADD CONSTRAINT commitments_priority_positive_check
    CHECK ("capital_return_priority" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "capital_commitments" ADD CONSTRAINT commitments_amount_positive_check
    CHECK ("committed_amount_minor" > 0 AND "committed_amount_usd_minor" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "capital_commitments" ADD CONSTRAINT commitments_fx_positive_check
    CHECK ("fx_rate_at_commitment" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS capital_commitments_investor_idx ON "capital_commitments" ("investor_id");
CREATE INDEX IF NOT EXISTS capital_commitments_project_idx ON "capital_commitments" ("project_id");
CREATE INDEX IF NOT EXISTS capital_commitments_status_idx ON "capital_commitments" ("status");

-- -----------------------------------------------------------------------------
-- 3) capital_drawdowns — capital call from investor to project
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "capital_drawdowns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "commitment_id" uuid NOT NULL REFERENCES "capital_commitments"("id") ON DELETE RESTRICT,
  "drawdown_number" integer NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "amount_usd_minor" bigint NOT NULL,
  "fx_rate_at_drawdown" numeric(20, 8) NOT NULL,
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "due_date" date NOT NULL,
  "received_at" timestamptz,
  "status" text NOT NULL DEFAULT 'requested',
  "trigger_reason" text NOT NULL,
  "trigger_balance_at_request_usd_minor" bigint,
  "payment_method" text,
  "payment_reference" text,
  "receipt_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("commitment_id", "drawdown_number")
);

DO $$ BEGIN
  ALTER TABLE "capital_drawdowns" ADD CONSTRAINT drawdowns_currency_check
    CHECK ("currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "capital_drawdowns" ADD CONSTRAINT drawdowns_status_check
    CHECK ("status" IN ('requested','received','overdue','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "capital_drawdowns" ADD CONSTRAINT drawdowns_amount_positive_check
    CHECK ("amount_minor" > 0 AND "amount_usd_minor" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "capital_drawdowns" ADD CONSTRAINT drawdowns_drawdown_number_check
    CHECK ("drawdown_number" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS capital_drawdowns_commitment_idx ON "capital_drawdowns" ("commitment_id");
CREATE INDEX IF NOT EXISTS capital_drawdowns_status_idx ON "capital_drawdowns" ("status");
CREATE INDEX IF NOT EXISTS capital_drawdowns_due_idx
  ON "capital_drawdowns" ("due_date")
  WHERE "status" IN ('requested','overdue');

-- -----------------------------------------------------------------------------
-- 4) investor_wallets — per-commitment holding account
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "investor_wallets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "commitment_id" uuid NOT NULL UNIQUE REFERENCES "capital_commitments"("id") ON DELETE RESTRICT,
  "available_balance_usd_minor" bigint NOT NULL DEFAULT 0,
  "hold_balance_usd_minor" bigint NOT NULL DEFAULT 0,
  "reinvest_pending_usd_minor" bigint NOT NULL DEFAULT 0,
  "total_drawn_usd_minor" bigint NOT NULL DEFAULT 0,
  "total_returned_capital_usd_minor" bigint NOT NULL DEFAULT 0,
  "total_profit_distributed_usd_minor" bigint NOT NULL DEFAULT 0,
  "total_withdrawn_usd_minor" bigint NOT NULL DEFAULT 0,
  "total_reinvested_usd_minor" bigint NOT NULL DEFAULT 0,
  "last_activity_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "investor_wallets" ADD CONSTRAINT wallets_balances_nonneg_check
    CHECK ("available_balance_usd_minor" >= 0
      AND "hold_balance_usd_minor" >= 0
      AND "reinvest_pending_usd_minor" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS investor_wallets_commitment_idx ON "investor_wallets" ("commitment_id");

-- -----------------------------------------------------------------------------
-- 5) wallet_transactions — append-only ledger; source of truth for IRR
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "wallet_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "wallet_id" uuid NOT NULL REFERENCES "investor_wallets"("id") ON DELETE RESTRICT,
  "commitment_id" uuid NOT NULL REFERENCES "capital_commitments"("id") ON DELETE RESTRICT,
  "transaction_type" text NOT NULL,
  "amount_usd_minor" bigint NOT NULL,
  "amount_original_minor" bigint,
  "original_currency" text,
  "fx_rate_at_transaction" numeric(20, 8),
  "balance_available_after_usd_minor" bigint NOT NULL,
  "balance_hold_after_usd_minor" bigint NOT NULL,
  "drawdown_id" uuid REFERENCES "capital_drawdowns"("id") ON DELETE RESTRICT,
  "distribution_id" uuid,
  "asset_taken_villa_id" uuid REFERENCES "villas"("id") ON DELETE RESTRICT,
  "reinvest_target_commitment_id" uuid REFERENCES "capital_commitments"("id") ON DELETE RESTRICT,
  "description" text,
  "external_reference" text,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "wallet_transactions" ADD CONSTRAINT wallet_tx_type_check
    CHECK ("transaction_type" IN (
      'drawdown_received',
      'capital_return',
      'profit_distribution',
      'wallet_withdrawal',
      'wallet_reinvest_out',
      'wallet_reinvest_in',
      'wallet_hold_set',
      'wallet_hold_release',
      'wallet_take_asset',
      'adjustment'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "wallet_transactions" ADD CONSTRAINT wallet_tx_currency_check
    CHECK ("original_currency" IS NULL
      OR "original_currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "wallet_transactions" ADD CONSTRAINT wallet_tx_balance_nonneg_check
    CHECK ("balance_available_after_usd_minor" >= 0
      AND "balance_hold_after_usd_minor" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_idx ON "wallet_transactions" ("wallet_id");
CREATE INDEX IF NOT EXISTS wallet_transactions_commitment_idx ON "wallet_transactions" ("commitment_id");
CREATE INDEX IF NOT EXISTS wallet_transactions_type_idx ON "wallet_transactions" ("transaction_type");
CREATE INDEX IF NOT EXISTS wallet_transactions_occurred_idx ON "wallet_transactions" ("occurred_at" DESC);
CREATE INDEX IF NOT EXISTS wallet_transactions_drawdown_idx ON "wallet_transactions" ("drawdown_id");

-- -----------------------------------------------------------------------------
-- 6) distributions — distribution event from project (or company) to many commitments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "distributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE RESTRICT,
  "distribution_number" integer NOT NULL,
  "distribution_type" text NOT NULL,
  "total_amount_usd_minor" bigint NOT NULL,
  "trigger_reason" text NOT NULL,
  "trigger_company_balance_usd_minor" bigint,
  "declared_at" timestamptz NOT NULL DEFAULT now(),
  "effective_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'declared',
  "completed_at" timestamptz,
  "notes" text,
  "declared_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("project_id", "distribution_number")
);

DO $$ BEGIN
  ALTER TABLE "distributions" ADD CONSTRAINT distributions_type_check
    CHECK ("distribution_type" IN ('capital_return','profit_distribution','mixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "distributions" ADD CONSTRAINT distributions_status_check
    CHECK ("status" IN ('declared','executing','completed','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "distributions" ADD CONSTRAINT distributions_amount_positive_check
    CHECK ("total_amount_usd_minor" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS distributions_project_idx ON "distributions" ("project_id");
CREATE INDEX IF NOT EXISTS distributions_status_idx ON "distributions" ("status");

-- Add the deferred FK from wallet_transactions → distributions now that it exists.
DO $$ BEGIN
  ALTER TABLE "wallet_transactions"
    ADD CONSTRAINT wallet_tx_distribution_fk
    FOREIGN KEY ("distribution_id") REFERENCES "distributions"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS wallet_transactions_distribution_idx ON "wallet_transactions" ("distribution_id");

-- -----------------------------------------------------------------------------
-- 7) distribution_allocations — per-commitment line items in a distribution
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "distribution_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "distribution_id" uuid NOT NULL REFERENCES "distributions"("id") ON DELETE CASCADE,
  "commitment_id" uuid NOT NULL REFERENCES "capital_commitments"("id") ON DELETE RESTRICT,
  "capital_return_amount_usd_minor" bigint NOT NULL DEFAULT 0,
  "profit_amount_usd_minor" bigint NOT NULL DEFAULT 0,
  "total_amount_usd_minor" bigint NOT NULL,
  "outstanding_capital_at_declare_usd_minor" bigint NOT NULL,
  "profit_share_percent_used" numeric(7, 4) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "executed_at" timestamptz,
  "wallet_transaction_id" uuid REFERENCES "wallet_transactions"("id") ON DELETE RESTRICT,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "distribution_allocations" ADD CONSTRAINT alloc_status_check
    CHECK ("status" IN ('pending','executed','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "distribution_allocations" ADD CONSTRAINT alloc_amounts_nonneg_check
    CHECK ("capital_return_amount_usd_minor" >= 0
      AND "profit_amount_usd_minor" >= 0
      AND "total_amount_usd_minor" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "distribution_allocations" ADD CONSTRAINT alloc_total_consistent_check
    CHECK ("total_amount_usd_minor"
      = "capital_return_amount_usd_minor" + "profit_amount_usd_minor");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS distribution_allocations_distribution_idx
  ON "distribution_allocations" ("distribution_id");
CREATE INDEX IF NOT EXISTS distribution_allocations_commitment_idx
  ON "distribution_allocations" ("commitment_id");

-- =============================================================================
-- DEVELOPMENT FINANCE LEDGER CLUSTER (dev_* prefix)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 8) dev_bank_accounts — company bank accounts and crypto wallets
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dev_bank_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_code" text UNIQUE NOT NULL,
  "account_name" text NOT NULL,
  "account_type" text NOT NULL,
  "currency" text NOT NULL,
  "bank_name" text,
  "account_number" text,
  "swift_code" text,
  "iban" text,
  "wallet_address" text,
  "minimum_balance_threshold_minor" bigint,
  "current_balance_minor" bigint NOT NULL DEFAULT 0,
  "current_balance_usd_minor" bigint NOT NULL DEFAULT 0,
  "last_fx_rate" numeric(20, 8),
  "last_balance_at" timestamptz,
  "primary_project_id" uuid REFERENCES "projects"("id") ON DELETE RESTRICT,
  "is_company_account" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "dev_bank_accounts" ADD CONSTRAINT bank_accounts_type_check
    CHECK ("account_type" IN ('bank','crypto_exchange','crypto_wallet','cash'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dev_bank_accounts" ADD CONSTRAINT bank_accounts_currency_check
    CHECK ("currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS dev_bank_accounts_active_idx
  ON "dev_bank_accounts" ("is_active") WHERE "is_active" = true;
CREATE INDEX IF NOT EXISTS dev_bank_accounts_currency_idx ON "dev_bank_accounts" ("currency");
CREATE INDEX IF NOT EXISTS dev_bank_accounts_project_idx ON "dev_bank_accounts" ("primary_project_id");

-- -----------------------------------------------------------------------------
-- 9) dev_cost_categories — hierarchical cost categories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dev_cost_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_code" text UNIQUE NOT NULL,
  "parent_category_id" uuid REFERENCES "dev_cost_categories"("id") ON DELETE RESTRICT,
  "display_name" text NOT NULL,
  "display_name_translations" jsonb,
  "category_type" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "display_order" integer NOT NULL DEFAULT 100,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "dev_cost_categories" ADD CONSTRAINT categories_type_check
    CHECK ("category_type" IN (
      'capex','opex','cogs','fee_income','sale_income','rental_income','corporate_event'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS dev_cost_categories_parent_idx
  ON "dev_cost_categories" ("parent_category_id");
CREATE INDEX IF NOT EXISTS dev_cost_categories_type_idx
  ON "dev_cost_categories" ("category_type");

-- -----------------------------------------------------------------------------
-- 10) dev_budget_lines — versioned budgeted amounts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dev_budget_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "category_id" uuid NOT NULL REFERENCES "dev_cost_categories"("id") ON DELETE RESTRICT,
  "unit_id" uuid REFERENCES "villas"("id") ON DELETE RESTRICT,
  "budgeted_amount_usd_minor" bigint NOT NULL,
  "budgeted_at_currency" text NOT NULL DEFAULT 'USD',
  "budgeted_amount_original_minor" bigint,
  "budgeted_fx_rate" numeric(20, 8),
  "budget_version" integer NOT NULL DEFAULT 1,
  "effective_from" date NOT NULL,
  "superseded_at" timestamptz,
  "superseded_by_id" uuid REFERENCES "dev_budget_lines"("id") ON DELETE RESTRICT,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "dev_budget_lines" ADD CONSTRAINT budget_currency_check
    CHECK ("budgeted_at_currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS dev_budget_lines_project_idx ON "dev_budget_lines" ("project_id");
CREATE INDEX IF NOT EXISTS dev_budget_lines_category_idx ON "dev_budget_lines" ("category_id");
CREATE INDEX IF NOT EXISTS dev_budget_lines_unit_idx ON "dev_budget_lines" ("unit_id");
CREATE INDEX IF NOT EXISTS dev_budget_lines_active_idx
  ON "dev_budget_lines" ("project_id", "category_id") WHERE "superseded_at" IS NULL;

-- -----------------------------------------------------------------------------
-- 11) dev_commitments_ledger — POs, signed vendor contracts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dev_commitments_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "category_id" uuid NOT NULL REFERENCES "dev_cost_categories"("id") ON DELETE RESTRICT,
  "unit_id" uuid REFERENCES "villas"("id") ON DELETE RESTRICT,
  "commitment_code" text UNIQUE NOT NULL,
  "vendor_contact_id" uuid REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "amount_usd_minor" bigint NOT NULL,
  "amount_currency" text NOT NULL,
  "amount_original_minor" bigint NOT NULL,
  "fx_rate_at_commit" numeric(20, 8) NOT NULL,
  "description" text NOT NULL,
  "committed_date" date NOT NULL,
  "expected_completion_date" date,
  "status" text NOT NULL DEFAULT 'open',
  "contract_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "dev_commitments_ledger" ADD CONSTRAINT dev_commit_currency_check
    CHECK ("amount_currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dev_commitments_ledger" ADD CONSTRAINT dev_commit_status_check
    CHECK ("status" IN ('open','partially_paid','completed','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS dev_commitments_ledger_project_idx
  ON "dev_commitments_ledger" ("project_id");
CREATE INDEX IF NOT EXISTS dev_commitments_ledger_status_idx
  ON "dev_commitments_ledger" ("status");
CREATE INDEX IF NOT EXISTS dev_commitments_ledger_vendor_idx
  ON "dev_commitments_ledger" ("vendor_contact_id");

-- -----------------------------------------------------------------------------
-- 12) dev_transactions — actual money movements
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dev_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "transaction_code" text UNIQUE NOT NULL,
  "bank_account_id" uuid NOT NULL REFERENCES "dev_bank_accounts"("id") ON DELETE RESTRICT,
  "direction" text NOT NULL,
  "category_id" uuid REFERENCES "dev_cost_categories"("id") ON DELETE RESTRICT,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE RESTRICT,
  "unit_id" uuid REFERENCES "villas"("id") ON DELETE RESTRICT,
  "related_commitment_id" uuid REFERENCES "dev_commitments_ledger"("id") ON DELETE RESTRICT,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "amount_usd_minor" bigint NOT NULL,
  "fx_rate_at_transaction" numeric(20, 8) NOT NULL,
  "counterparty_name" text,
  "counterparty_contact_id" uuid REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "transaction_date" date NOT NULL,
  "description" text NOT NULL,
  "external_reference" text,
  "allocation_type" text NOT NULL DEFAULT 'single_project',
  "allocation_metadata" jsonb,
  "related_drawdown_id" uuid REFERENCES "capital_drawdowns"("id") ON DELETE RESTRICT,
  "related_distribution_id" uuid REFERENCES "distributions"("id") ON DELETE RESTRICT,
  "receipt_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "reconciled_at" timestamptz,
  "reconciled_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "bank_statement_line_ref" text,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "dev_transactions" ADD CONSTRAINT dev_tx_direction_check
    CHECK ("direction" IN ('inflow','outflow','internal_transfer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dev_transactions" ADD CONSTRAINT dev_tx_currency_check
    CHECK ("currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dev_transactions" ADD CONSTRAINT dev_tx_allocation_check
    CHECK ("allocation_type" IN ('single_project','multi_project','company_overhead'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS dev_transactions_account_idx ON "dev_transactions" ("bank_account_id");
CREATE INDEX IF NOT EXISTS dev_transactions_project_idx ON "dev_transactions" ("project_id");
CREATE INDEX IF NOT EXISTS dev_transactions_category_idx ON "dev_transactions" ("category_id");
CREATE INDEX IF NOT EXISTS dev_transactions_date_idx
  ON "dev_transactions" ("transaction_date" DESC);
CREATE INDEX IF NOT EXISTS dev_transactions_drawdown_idx
  ON "dev_transactions" ("related_drawdown_id");
CREATE INDEX IF NOT EXISTS dev_transactions_distribution_idx
  ON "dev_transactions" ("related_distribution_id");

-- -----------------------------------------------------------------------------
-- 13) dev_corporate_events — director loans, dividends, share transfers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dev_corporate_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_code" text UNIQUE NOT NULL,
  "event_type" text NOT NULL,
  "related_contact_id" uuid REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "amount_usd_minor" bigint NOT NULL,
  "amount_currency" text NOT NULL,
  "amount_original_minor" bigint NOT NULL,
  "fx_rate" numeric(20, 8) NOT NULL,
  "event_date" date NOT NULL,
  "description" text NOT NULL,
  "related_transaction_id" uuid REFERENCES "dev_transactions"("id") ON DELETE RESTRICT,
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "dev_corporate_events" ADD CONSTRAINT corp_events_type_check
    CHECK ("event_type" IN (
      'director_loan_in','director_loan_repayment','shareholder_contribution',
      'dividend_declared','dividend_paid','share_transfer','other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dev_corporate_events" ADD CONSTRAINT corp_events_currency_check
    CHECK ("amount_currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS dev_corporate_events_type_idx
  ON "dev_corporate_events" ("event_type");
CREATE INDEX IF NOT EXISTS dev_corporate_events_date_idx
  ON "dev_corporate_events" ("event_date" DESC);

-- -----------------------------------------------------------------------------
-- 14) dev_fx_snapshots — daily FX rates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dev_fx_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_date" date NOT NULL UNIQUE,
  "base_currency" text NOT NULL DEFAULT 'USD',
  "rate_idr" numeric(20, 8) NOT NULL,
  "rate_rub" numeric(20, 8),
  "rate_eur" numeric(20, 8),
  "rate_usdt" numeric(20, 8) NOT NULL DEFAULT 1.0,
  "rate_cny" numeric(20, 8),
  "source" text NOT NULL DEFAULT 'manual',
  "notes" text,
  "recorded_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "dev_fx_snapshots" ADD CONSTRAINT fx_snapshots_source_check
    CHECK ("source" IN ('manual','api','wise','xe','custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS dev_fx_snapshots_date_idx
  ON "dev_fx_snapshots" ("snapshot_date" DESC);

-- =============================================================================
-- RLS — internal-only read/write for every new table.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'investors',
      'capital_commitments',
      'capital_drawdowns',
      'investor_wallets',
      'wallet_transactions',
      'distributions',
      'distribution_allocations',
      'dev_bank_accounts',
      'dev_cost_categories',
      'dev_budget_lines',
      'dev_commitments_ledger',
      'dev_transactions',
      'dev_corporate_events',
      'dev_fx_snapshots'
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

-- =============================================================================
-- Mid-stage refactor: widen profit_share columns from NUMERIC(6,4) to (7,4)
-- so values up to 100.0000 (full GP profit share) fit. Earlier draft used
-- (6,4) which only accommodates up to 99.9999. Idempotent: ALTER TYPE is a
-- no-op when the type already matches.
-- =============================================================================
DO $$ BEGIN
  ALTER TABLE "capital_commitments"
    ALTER COLUMN "profit_share_percent" TYPE numeric(7,4);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "distribution_allocations"
    ALTER COLUMN "profit_share_percent_used" TYPE numeric(7,4);
EXCEPTION WHEN others THEN NULL; END $$;

COMMIT;
