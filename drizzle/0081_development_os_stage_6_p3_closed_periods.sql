-- =============================================================================
-- 0081 — Development OS · Stage 6.P3.G — Period close ledger
--
-- 1 small table that records when an organization closed an
-- accounting period. The bookkeeper UI surfaces this as a
-- "period_closed" badge in the daily review; cron jobs check it to
-- block backdated transaction modifications.
--
-- Enforcement (blocking writes to a closed period) is layered in via
-- service-layer guards rather than DB triggers — the transaction
-- modification flow lives in P0.4 + P3.G's BankingService and we
-- prefer keeping the lock check application-side so admin overrides
-- can be audited (Stage 5.J security_events).
--
-- RLS: per-org isolation via is_in_user_organization() (Stage 5.J).
-- Uses FOREACH IN ARRAY (per the migration 0075 lesson).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "closed_periods" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  /** Period boundaries — inclusive of both endpoints. */
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,

  /** PeriodScope FSM — month / quarter / year / custom. */
  "scope" TEXT NOT NULL DEFAULT 'month' CHECK ("scope" IN (
    'month', 'quarter', 'year', 'custom'
  )),

  /** Snapshot counters captured at close-time so the UI can show
   *  "as-of-close" totals without recomputing. */
  "transactions_count" INTEGER NOT NULL DEFAULT 0,
  "reconciled_count" INTEGER NOT NULL DEFAULT 0,
  "unmatched_count" INTEGER NOT NULL DEFAULT 0,

  "notes" TEXT,

  /** Audit. */
  "closed_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "closed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  /** When non-null, the period has been re-opened by an admin and
   *  the lock no longer applies. */
  "reopened_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reopened_at" TIMESTAMPTZ,
  "reopen_reason" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One closed period per (org, period_start, period_end). Re-opening
  -- doesn't delete the row — it sets reopened_at, so the audit trail
  -- survives.
  UNIQUE ("organization_id", "period_start", "period_end")
);

CREATE INDEX IF NOT EXISTS "closed_periods_org_idx"
  ON "closed_periods"("organization_id");
CREATE INDEX IF NOT EXISTS "closed_periods_active_idx"
  ON "closed_periods"("organization_id", "period_end" DESC)
  WHERE "reopened_at" IS NULL;

DROP TRIGGER IF EXISTS "trg_closed_periods_updated_at" ON "closed_periods";
CREATE TRIGGER "trg_closed_periods_updated_at"
  BEFORE UPDATE ON "closed_periods"
  FOR EACH ROW EXECUTE FUNCTION "banking_set_updated_at"();

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['closed_periods']
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
