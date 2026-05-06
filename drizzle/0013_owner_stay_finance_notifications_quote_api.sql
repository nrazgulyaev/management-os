-- =============================================================================
-- 0013 — Owner-stay → finance bridge, owner-stay notifications, quote API
-- groundwork (v9C).
--
-- Adds `owner_stay_finance_links` (the audit-ready bridge between an
-- approved/completed owner stay and the finance rows it materialises),
-- plus `finance_bridge_status` / `finance_link_id` / `completed_at`
-- columns on `owner_stay_requests`. RLS keeps the new table internal-only;
-- owners never read raw bridge rows — they reach finance via owner
-- statements + the safe owner-stay request summary they already see in
-- v9B.
--
-- No bank reconciliation, no payments, no PriceLabs in this migration.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) owner_stay_finance_links — one row per owner-stay request that has
-- been considered for the finance bridge. Status captures whether we
-- materialised rows, skipped (no charge / locked period), failed, or
-- reversed. The unique index on `owner_stay_request_id` makes every
-- bridge attempt idempotent.
CREATE TABLE IF NOT EXISTS "owner_stay_finance_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_stay_request_id" uuid NOT NULL
    REFERENCES "owner_stay_requests"("id") ON DELETE CASCADE,
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "statement_period_id" uuid REFERENCES "statement_periods"("id")
    ON DELETE SET NULL,
  "compensation_revenue_line_id" uuid REFERENCES "revenue_lines"("id")
    ON DELETE SET NULL,
  "operational_expense_line_id" uuid REFERENCES "expense_lines"("id")
    ON DELETE SET NULL,
  "management_fee_line_id" uuid REFERENCES "management_fee_lines"("id")
    ON DELETE SET NULL,
  "bridge_status" text NOT NULL DEFAULT 'pending',
  "amount_minor" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'USD',
  "reason" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "owner_stay_finance_links"
    ADD CONSTRAINT owner_stay_finance_links_status_check
    CHECK ("bridge_status" IN (
      'pending','bridged','skipped_no_charge','skipped_locked_period',
      'failed','reversed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One link row per request (idempotency anchor).
CREATE UNIQUE INDEX IF NOT EXISTS "owner_stay_finance_links_request_unique"
  ON "owner_stay_finance_links" ("owner_stay_request_id");

CREATE INDEX IF NOT EXISTS "owner_stay_finance_links_owner_idx"
  ON "owner_stay_finance_links" ("owner_id");
CREATE INDEX IF NOT EXISTS "owner_stay_finance_links_status_idx"
  ON "owner_stay_finance_links" ("bridge_status");
CREATE INDEX IF NOT EXISTS "owner_stay_finance_links_period_idx"
  ON "owner_stay_finance_links" ("statement_period_id");

-- 2) Add helper columns on owner_stay_requests.
ALTER TABLE "owner_stay_requests"
  ADD COLUMN IF NOT EXISTS "finance_bridge_status" text NOT NULL DEFAULT 'pending';

DO $$ BEGIN
  ALTER TABLE "owner_stay_requests"
    ADD CONSTRAINT owner_stay_requests_finance_bridge_status_check
    CHECK ("finance_bridge_status" IN (
      'pending','bridged','skipped_no_charge','skipped_locked_period',
      'failed','reversed','not_applicable'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "owner_stay_requests"
  ADD COLUMN IF NOT EXISTS "finance_link_id" uuid;

DO $$ BEGIN
  ALTER TABLE "owner_stay_requests"
    ADD CONSTRAINT owner_stay_requests_finance_link_fk
    FOREIGN KEY ("finance_link_id")
    REFERENCES "owner_stay_finance_links"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "owner_stay_requests"
  ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;

CREATE INDEX IF NOT EXISTS "owner_stay_requests_finance_bridge_idx"
  ON "owner_stay_requests" ("finance_bridge_status");

-- 3) RLS — finance bridge rows are internal-only. Owners never read raw
-- rows; they see status through the request row + statement.
ALTER TABLE "owner_stay_finance_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_stay_finance_links" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_read ON "owner_stay_finance_links";
CREATE POLICY internal_read ON "owner_stay_finance_links"
  FOR SELECT USING (public.is_internal_user());

DROP POLICY IF EXISTS internal_write ON "owner_stay_finance_links";
CREATE POLICY internal_write ON "owner_stay_finance_links"
  FOR ALL
  USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

COMMIT;
