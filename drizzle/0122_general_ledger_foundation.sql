-- 0122 — Double-entry General Ledger foundation.
--
-- Sits ALONGSIDE the existing finance tables (does not replace
-- owner_statements / dev_transactions / etc). The existing tables remain
-- the operational sub-ledgers; the GL is the additive double-entry
-- "proving spine" fed FROM them (auto-post wiring lands in later PRs).
--
-- Money = bigint MINOR units (cents), never numeric — parity with
-- finance.ts. Per-entry debit/credit must net to zero (asserted in the
-- postJournal() service; per-line validity hardened by the column CHECK).
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE restrict,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,            -- asset|liability|equity|revenue|expense
  "normal_balance" text NOT NULL,  -- debit|credit
  "parent_code" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "coa_org_code_unique" ON "chart_of_accounts" ("organization_id", "code");
CREATE INDEX IF NOT EXISTS "coa_org_type_idx" ON "chart_of_accounts" ("organization_id", "type");

CREATE TABLE IF NOT EXISTS "journal_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE restrict,
  "period_id" uuid REFERENCES "statement_periods"("id") ON DELETE restrict,
  "entry_date" date NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "memo" text,
  "source_table" text,
  "source_id" uuid,
  "external_ref" text,
  "status" text NOT NULL DEFAULT 'posted',
  "reverses_entry_id" uuid,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "je_org_date_idx" ON "journal_entries" ("organization_id", "entry_date");
-- Idempotency key: at most one entry per source row (backfills + double-fired actions are safe).
CREATE UNIQUE INDEX IF NOT EXISTS "je_source_unique" ON "journal_entries" ("source_table", "source_id")
  WHERE "source_table" IS NOT NULL AND "source_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "je_period_idx" ON "journal_entries" ("period_id");

CREATE TABLE IF NOT EXISTS "journal_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE restrict,
  "entry_id" uuid NOT NULL REFERENCES "journal_entries"("id") ON DELETE cascade,
  "account_id" uuid NOT NULL REFERENCES "chart_of_accounts"("id") ON DELETE restrict,
  "debit_minor" bigint NOT NULL DEFAULT 0,
  "credit_minor" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'USD',
  "line_memo" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  -- exactly one side nonzero, both non-negative.
  CONSTRAINT "jl_one_side_nonzero" CHECK (
    "debit_minor" >= 0 AND "credit_minor" >= 0
    AND (("debit_minor" = 0) <> ("credit_minor" = 0))
  )
);
CREATE INDEX IF NOT EXISTS "jl_entry_idx" ON "journal_lines" ("entry_id");
CREATE INDEX IF NOT EXISTS "jl_account_idx" ON "journal_lines" ("account_id");
CREATE INDEX IF NOT EXISTS "jl_org_account_idx" ON "journal_lines" ("organization_id", "account_id");
