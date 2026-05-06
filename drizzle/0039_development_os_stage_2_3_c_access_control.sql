-- =============================================================================
-- 0039 — Development OS · Stage 2.3.C
--   Investor portal access control: links auth users to investors and adds
--   per-investor RLS SELECT policies on every Stage 2.3 table that the
--   portal exposes.
--
-- Adaptations from the spec, with rationale:
--
-- 1. The spec proposed a new role 'investor_view'. The existing roles
--    table already has 'investor_viewer' (and 'investor_owner') seeded.
--    We use 'investor_viewer' to avoid splintering the role taxonomy.
--
-- 2. The spec proposed `app_users.role` enum + CHECK update. In this
--    codebase, roles are in `user_roles` ↔ `roles` (key='investor_viewer'),
--    not a direct column on app_users. The helper functions therefore
--    join through user_roles, mirroring the existing `is_internal_user()`
--    pattern.
--
-- 3. The spec proposed `SECURITY INVOKER` on the new helper functions.
--    The existing `is_internal_user()` uses `SECURITY DEFINER` because
--    helper functions used INSIDE RLS policies must be able to read
--    `app_users`/`user_roles`/`roles` even when the caller's RLS would
--    otherwise block those rows (circular RLS). We follow the existing
--    DEFINER convention for consistency and correctness — the functions
--    only read auth-related rows, never user data, so the privilege
--    surface is tightly bounded.
--
-- All policies use `is_investor_user()` to gate, then scope by
-- `current_investor_id()`. Internal staff policies (the existing
-- `internal_read` / `internal_write` pair from migration 0037) remain
-- unchanged — they always see all rows.
--
-- Idempotent: every CREATE uses IF NOT EXISTS / OR REPLACE; every
-- policy DROP uses IF EXISTS. Wrapped in BEGIN; ... COMMIT;.
-- =============================================================================

BEGIN;

-- 1) Add investor_id to app_users -------------------------------------------
DO $$ BEGIN
  ALTER TABLE "app_users"
    ADD COLUMN "investor_id" uuid REFERENCES "investors"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS app_users_investor_idx
  ON "app_users" ("investor_id")
  WHERE "investor_id" IS NOT NULL;

-- 2) Helper functions -------------------------------------------------------
-- See migration header comment for the SECURITY DEFINER rationale.

CREATE OR REPLACE FUNCTION public.is_investor_user()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
      FROM public.app_users u
      JOIN public.user_roles ur ON ur.user_id = u.id
      JOIN public.roles r ON r.id = ur.role_id
     WHERE u.auth_user_id = auth.uid()
       AND u.status = 'active'
       AND u.investor_id IS NOT NULL
       AND r.key = 'investor_viewer'
  );
EXCEPTION WHEN undefined_function THEN
  -- auth.uid() is unavailable outside a Supabase session (e.g. migrations).
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION public.current_investor_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT u.investor_id
      FROM public.app_users u
      JOIN public.user_roles ur ON ur.user_id = u.id
      JOIN public.roles r ON r.id = ur.role_id
     WHERE u.auth_user_id = auth.uid()
       AND u.status = 'active'
       AND r.key = 'investor_viewer'
     LIMIT 1
  );
EXCEPTION WHEN undefined_function THEN
  RETURN NULL;
END
$$;

-- 3) Investor-scoped SELECT policies ----------------------------------------
-- Each policy is a parallel SELECT. The existing `internal_read` and
-- `internal_write` from migration 0037 stay intact; they OR with these.

DROP POLICY IF EXISTS investor_can_read_self ON "investors";
CREATE POLICY investor_can_read_self ON "investors"
  FOR SELECT
  USING (
    public.is_investor_user() AND id = public.current_investor_id()
  );

DROP POLICY IF EXISTS investor_can_read_own_commitments ON "capital_commitments";
CREATE POLICY investor_can_read_own_commitments ON "capital_commitments"
  FOR SELECT
  USING (
    public.is_investor_user()
    AND investor_id = public.current_investor_id()
  );

DROP POLICY IF EXISTS investor_can_read_own_drawdowns ON "capital_drawdowns";
CREATE POLICY investor_can_read_own_drawdowns ON "capital_drawdowns"
  FOR SELECT
  USING (
    public.is_investor_user()
    AND commitment_id IN (
      SELECT id FROM public.capital_commitments
      WHERE investor_id = public.current_investor_id()
    )
  );

DROP POLICY IF EXISTS investor_can_read_own_wallets ON "investor_wallets";
CREATE POLICY investor_can_read_own_wallets ON "investor_wallets"
  FOR SELECT
  USING (
    public.is_investor_user()
    AND commitment_id IN (
      SELECT id FROM public.capital_commitments
      WHERE investor_id = public.current_investor_id()
    )
  );

DROP POLICY IF EXISTS investor_can_read_own_wallet_txns ON "wallet_transactions";
CREATE POLICY investor_can_read_own_wallet_txns ON "wallet_transactions"
  FOR SELECT
  USING (
    public.is_investor_user()
    AND commitment_id IN (
      SELECT id FROM public.capital_commitments
      WHERE investor_id = public.current_investor_id()
    )
  );

DROP POLICY IF EXISTS investor_can_read_own_allocations ON "distribution_allocations";
CREATE POLICY investor_can_read_own_allocations ON "distribution_allocations"
  FOR SELECT
  USING (
    public.is_investor_user()
    AND commitment_id IN (
      SELECT id FROM public.capital_commitments
      WHERE investor_id = public.current_investor_id()
    )
  );

-- The distribution header is visible to an investor IF they have at least
-- one allocation in it. Their allocation row is gated by the policy above;
-- other investors' allocations stay invisible.
DROP POLICY IF EXISTS investor_can_read_own_distributions ON "distributions";
CREATE POLICY investor_can_read_own_distributions ON "distributions"
  FOR SELECT
  USING (
    public.is_investor_user()
    AND id IN (
      SELECT distribution_id FROM public.distribution_allocations
      WHERE commitment_id IN (
        SELECT id FROM public.capital_commitments
        WHERE investor_id = public.current_investor_id()
      )
    )
  );

-- Documents — visible if linked from the investor's own commitments or
-- drawdowns. Wider document access (e.g. portfolio reports) is added in
-- a future stage with a dedicated `investor_visible` join table; for now
-- only direct links count.
DROP POLICY IF EXISTS investor_can_read_own_documents ON "documents";
CREATE POLICY investor_can_read_own_documents ON "documents"
  FOR SELECT
  USING (
    public.is_investor_user()
    AND id IN (
      SELECT agreement_document_id
        FROM public.capital_commitments
       WHERE investor_id = public.current_investor_id()
         AND agreement_document_id IS NOT NULL
      UNION
      SELECT receipt_document_id
        FROM public.capital_drawdowns
       WHERE commitment_id IN (
         SELECT id FROM public.capital_commitments
         WHERE investor_id = public.current_investor_id()
       )
       AND receipt_document_id IS NOT NULL
    )
  );

-- 4) Documented EXCLUSIONS --------------------------------------------------
-- The following tables have NO investor SELECT policy. Default-deny means
-- investors get zero rows. Verified in the access-control test harness.
--   - dev_bank_accounts, dev_transactions, dev_budget_lines,
--     dev_commitments_ledger, dev_corporate_events, dev_fx_snapshots,
--     dev_cost_categories
--   - contacts, contact_roles, contact_interactions, agents, lead_sources
--   - dev_notification_rules, dev_notification_templates,
--     dev_notification_delivery_log
--   - all Management OS tables (already protected)

-- 5) Privilege escalation guard --------------------------------------------
-- An investor user must not be able to UPDATE their own app_users row to
-- swap `investor_id` (which would let them masquerade as another investor).
-- We rely on app_users' existing RLS — no UPDATE policy for the investor
-- role exists, and the `internal_write` policy requires `is_internal_user()`.
-- The constraint below is defense-in-depth via a trigger that rejects any
-- non-internal UPDATE to investor_id.

CREATE OR REPLACE FUNCTION public.protect_app_users_investor_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Allow inserts and unrelated updates; only intercept investor_id changes
  -- by non-internal callers.
  IF TG_OP = 'UPDATE' AND OLD.investor_id IS DISTINCT FROM NEW.investor_id THEN
    IF NOT public.is_internal_user() THEN
      RAISE EXCEPTION 'Only internal staff may change app_users.investor_id (privilege escalation guard)';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS protect_app_users_investor_id_trg ON "app_users";
CREATE TRIGGER protect_app_users_investor_id_trg
  BEFORE UPDATE ON "app_users"
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_app_users_investor_id();

COMMIT;
