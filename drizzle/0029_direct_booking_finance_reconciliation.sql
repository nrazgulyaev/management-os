-- =============================================================================
-- Prompt 107 — Direct Booking Finance Reconciliation + Deposit Expiry.
--
-- One new table (`direct_booking_finance_links`) plus column additions
-- on the existing `direct_booking_deposits` and `direct_booking_requests`
-- tables.
--
--   direct_booking_finance_links — idempotent finance bridge. Links a
--                                   converted direct-booking request
--                                   to its `revenue_lines` row + the
--                                   statement period it landed in.
--
-- New columns:
--   direct_booking_deposits.balance_due_minor (bigint default 0)
--   direct_booking_deposits.expires_reason (text)
--   direct_booking_requests.finance_bridge_status (text default pending)
--   direct_booking_requests.finance_link_id (uuid → finance_links.id)
--
-- All RLS policies use the existing `public.is_internal_user()` shim.
-- =============================================================================

-- 1) direct_booking_finance_links
CREATE TABLE IF NOT EXISTS "direct_booking_finance_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid REFERENCES "direct_booking_requests"("id") ON DELETE CASCADE,
  "hold_id" uuid REFERENCES "direct_booking_holds"("id") ON DELETE SET NULL,
  "deposit_id" uuid REFERENCES "direct_booking_deposits"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "revenue_line_id" uuid REFERENCES "revenue_lines"("id") ON DELETE SET NULL,
  "statement_period_id" uuid REFERENCES "statement_periods"("id") ON DELETE SET NULL,
  "link_code" text NOT NULL UNIQUE,
  "gross_amount_minor" bigint NOT NULL DEFAULT 0,
  "deposit_amount_minor" bigint NOT NULL DEFAULT 0,
  "balance_due_minor" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "posted_at" timestamptz,
  "reversed_at" timestamptz,
  "error" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_finance_links"
    ADD CONSTRAINT direct_booking_finance_links_status_check
    CHECK ("status" IN (
      'pending','posted','skipped_no_booking','skipped_locked_period',
      'failed','reversed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_finance_links"
    ADD CONSTRAINT direct_booking_finance_links_amounts_check
    CHECK (
      "gross_amount_minor" >= 0
      AND "deposit_amount_minor" >= 0
      AND "balance_due_minor" >= 0
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One link per request (1:1).
CREATE UNIQUE INDEX IF NOT EXISTS "direct_booking_finance_links_request_unique"
  ON "direct_booking_finance_links" ("request_id");

-- A booking can only attach to one link.
CREATE UNIQUE INDEX IF NOT EXISTS "direct_booking_finance_links_booking_unique"
  ON "direct_booking_finance_links" ("booking_id")
  WHERE "booking_id" IS NOT NULL;

-- A revenue_line can only attach to one link (idempotency anchor).
CREATE UNIQUE INDEX IF NOT EXISTS "direct_booking_finance_links_revenue_unique"
  ON "direct_booking_finance_links" ("revenue_line_id")
  WHERE "revenue_line_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "direct_booking_finance_links_status_idx"
  ON "direct_booking_finance_links" ("status");
CREATE INDEX IF NOT EXISTS "direct_booking_finance_links_statement_idx"
  ON "direct_booking_finance_links" ("statement_period_id");
CREATE INDEX IF NOT EXISTS "direct_booking_finance_links_posted_idx"
  ON "direct_booking_finance_links" ("posted_at" DESC);

-- 2) direct_booking_deposits — new columns
ALTER TABLE "direct_booking_deposits"
  ADD COLUMN IF NOT EXISTS "balance_due_minor" bigint NOT NULL DEFAULT 0;
ALTER TABLE "direct_booking_deposits"
  ADD COLUMN IF NOT EXISTS "expires_reason" text;

-- 3) direct_booking_requests — new columns
ALTER TABLE "direct_booking_requests"
  ADD COLUMN IF NOT EXISTS "finance_bridge_status" text NOT NULL DEFAULT 'pending';
ALTER TABLE "direct_booking_requests"
  ADD COLUMN IF NOT EXISTS "finance_link_id" uuid;

DO $$ BEGIN
  ALTER TABLE "direct_booking_requests"
    ADD CONSTRAINT direct_booking_requests_finance_bridge_status_check
    CHECK ("finance_bridge_status" IN (
      'pending','posted','skipped_no_booking','skipped_locked_period',
      'failed','reversed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_requests"
    ADD CONSTRAINT direct_booking_requests_finance_link_fk
    FOREIGN KEY ("finance_link_id")
      REFERENCES "direct_booking_finance_links"("id")
      ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "direct_booking_requests_finance_bridge_idx"
  ON "direct_booking_requests" ("finance_bridge_status");

-- =============================================================================
-- RLS — internal-only.
-- =============================================================================
DO $$
BEGIN
  EXECUTE 'ALTER TABLE "direct_booking_finance_links" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE "direct_booking_finance_links" FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS internal_read ON "direct_booking_finance_links"';
  EXECUTE 'CREATE POLICY internal_read ON "direct_booking_finance_links" FOR SELECT USING (public.is_internal_user())';
  EXECUTE 'DROP POLICY IF EXISTS internal_write ON "direct_booking_finance_links"';
  EXECUTE 'CREATE POLICY internal_write ON "direct_booking_finance_links" FOR ALL USING (public.is_internal_user()) WITH CHECK (public.is_internal_user())';
END $$;
