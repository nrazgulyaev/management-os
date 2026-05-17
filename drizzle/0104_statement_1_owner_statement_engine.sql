-- STATEMENT-1 — Owner statement engine: tenancy + period anchoring +
-- integrity hash + FX snapshot + delivery state on owner_statements.
--
-- Builds on the existing `owner_statements` / `statement_lines`
-- tables (introduced by migration 0002 finance_engine). Adds the
-- columns the production-grade statement generator needs:
--
--   - organization_id (TENANT-1 propagation; nullable on insert,
--     populated during generation via owner → ownership_shares →
--     project → organizations lookup)
--   - period_month — first-of-month date anchor for the statement.
--     Enables (org_id, owner_id, villa_id, period_month) uniqueness
--     without forcing all callers to materialise a statement_periods
--     row first.
--   - hash — sha256 of (period_month + line_type + amount × N), so
--     any after-the-fact tampering with statement_lines is detectable
--     by recomputing.
--   - fx_rate_snapshot — IDR/USD rate frozen at generation time so
--     net_to_owner_usd_minor stays stable across re-renders.
--   - net_to_owner_usd_minor — convenience column. Derived from
--     net_payout_minor × fx_rate_snapshot.
--   - sent_at / sent_to_email / pdf_url — delivery telemetry.
--   - operator_commission_pct — snapshot of the commission rate
--     applied at generation time (per-org-settable in future).
--
-- Status check widened to accept STATEMENT-1 workflow states:
--   draft → pending_approval → approved → sent
--   ↑ disputed (from any post-draft state)
--
-- Idempotent — re-running drops + re-adds CHECKs and skips columns
-- that already exist.

BEGIN;

-- 1. Multi-tenancy column.
ALTER TABLE "owner_statements"
  ADD COLUMN IF NOT EXISTS "organization_id" UUID
    REFERENCES "organizations"("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "owner_statements_org_idx"
  ON "owner_statements" ("organization_id");

-- 2. Period anchor (first of month).
ALTER TABLE "owner_statements"
  ADD COLUMN IF NOT EXISTS "period_month" DATE;

CREATE INDEX IF NOT EXISTS "owner_statements_period_month_idx"
  ON "owner_statements" ("period_month");

-- 3. STATEMENT-1 integrity + delivery columns.
ALTER TABLE "owner_statements"
  ADD COLUMN IF NOT EXISTS "operator_commission_pct" NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS "fx_rate_snapshot" NUMERIC(15,4),
  ADD COLUMN IF NOT EXISTS "net_to_owner_usd_minor" BIGINT,
  ADD COLUMN IF NOT EXISTS "content_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "sent_to_email" TEXT,
  ADD COLUMN IF NOT EXISTS "pdf_url" TEXT,
  ADD COLUMN IF NOT EXISTS "dispute_notes" TEXT;

-- 4. Uniqueness: one statement per (org, owner, villa, period_month).
-- Partial unique index because period_month / organization_id are
-- nullable for legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS "owner_statements_org_owner_villa_period_uniq"
  ON "owner_statements" ("organization_id", "owner_id", "villa_id", "period_month")
  WHERE "organization_id" IS NOT NULL
    AND "villa_id" IS NOT NULL
    AND "period_month" IS NOT NULL;

-- 5. Widen status CHECK to the STATEMENT-1 workflow.
-- Existing constraint accepts 'draft', 'issued', 'approved', 'sent';
-- add the intermediate + dispute states.
DO $$ BEGIN
  ALTER TABLE "owner_statements"
    DROP CONSTRAINT IF EXISTS "owner_statements_status_check";
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE "owner_statements"
  ADD CONSTRAINT "owner_statements_status_check"
    CHECK ("status" IN (
      'draft','pending_approval','issued','approved','sent','disputed','cancelled'
    ));

COMMIT;
