-- Arconique Management OS — Migration 0003
-- · Replaces email-match owner identification with explicit app_users_owners grants
-- · Adds statement_id to expense_allocations (materialisation target)
-- · Adds reserve balance view
-- · Refreshes RLS policies on owner_statements / statement_lines / payout_lines
-- Idempotent on re-run.

BEGIN;

-- =============================================================================
-- 1) app_users_owners — explicit owner-portal access grants
-- =============================================================================
CREATE TABLE IF NOT EXISTS "app_users_owners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "app_user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "grant_type" text NOT NULL DEFAULT 'owner_portal'
    CHECK ("grant_type" IN ('owner_portal','investor_readonly','finance_approver')),
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','revoked')),
  "granted_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "revoked_at" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "app_users_owners_app_user_idx" ON "app_users_owners" ("app_user_id");
CREATE INDEX IF NOT EXISTS "app_users_owners_owner_idx" ON "app_users_owners" ("owner_id");
CREATE INDEX IF NOT EXISTS "app_users_owners_status_idx" ON "app_users_owners" ("status");

-- One active grant per (user, owner, grant_type). Revoked rows allowed alongside.
CREATE UNIQUE INDEX IF NOT EXISTS "app_users_owners_active_unique"
  ON "app_users_owners" ("app_user_id","owner_id","grant_type")
  WHERE status = 'active';

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_set_updated_at ON "app_users_owners";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "app_users_owners"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE "app_users_owners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_users_owners" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_read ON "app_users_owners";
CREATE POLICY internal_read ON "app_users_owners" FOR SELECT
USING (public.is_internal_user());

-- The owner can see their own grants (so the owner portal can show "you have
-- access to N owner identities").
DROP POLICY IF EXISTS self_grant_read ON "app_users_owners";
CREATE POLICY self_grant_read ON "app_users_owners" FOR SELECT
USING (
  app_user_id IN (
    SELECT id FROM app_users WHERE auth_user_id = auth.uid() AND status = 'active'
  )
);

-- =============================================================================
-- 2) Replace current_owner_id() with current_owner_ids()
-- =============================================================================
-- Keep old function around to avoid breaking unused references, but rewrite
-- so it consults app_users_owners. v3.5+ callers should switch to current_owner_ids().
CREATE OR REPLACE FUNCTION public.current_owner_id() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE result uuid;
BEGIN
  SELECT auo.owner_id INTO result
    FROM public.app_users_owners auo
    JOIN public.app_users u ON u.id = auo.app_user_id
   WHERE u.auth_user_id = auth.uid()
     AND u.status = 'active'
     AND auo.status = 'active'
   ORDER BY auo.granted_at DESC
   LIMIT 1;
  RETURN result;
EXCEPTION WHEN undefined_function THEN
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION public.current_owner_ids() RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    SELECT auo.owner_id
      FROM public.app_users_owners auo
      JOIN public.app_users u ON u.id = auo.app_user_id
     WHERE u.auth_user_id = auth.uid()
       AND u.status = 'active'
       AND auo.status = 'active';
EXCEPTION WHEN undefined_function THEN
  RETURN;
END
$$;

-- =============================================================================
-- 3) Refresh owner-scoped RLS policies to use current_owner_ids()
-- =============================================================================

-- owner_statements: internal can read everything; owner can read their issued+ statements
DROP POLICY IF EXISTS owner_self_read ON owner_statements;
CREATE POLICY owner_self_read ON owner_statements FOR SELECT
USING (
  public.is_internal_user()
  OR (
    owner_id IN (SELECT public.current_owner_ids())
    AND status IN ('issued','approved','paid')
  )
);

-- statement_lines: only owner-visible lines on owner-readable statements
DROP POLICY IF EXISTS owner_self_lines_read ON statement_lines;
CREATE POLICY owner_self_lines_read ON statement_lines FOR SELECT
USING (
  public.is_internal_user()
  OR (
    owner_visible = true
    AND statement_id IN (
      SELECT id FROM owner_statements
       WHERE owner_id IN (SELECT public.current_owner_ids())
         AND status IN ('issued','approved','paid')
    )
  )
);

-- payout_lines: owner can see only approved/paid lines for their owner ids
DROP POLICY IF EXISTS owner_self_payouts_read ON payout_lines;
CREATE POLICY owner_self_payouts_read ON payout_lines FOR SELECT
USING (
  public.is_internal_user()
  OR (
    owner_id IN (SELECT public.current_owner_ids())
    AND status IN ('approved','paid')
  )
);

-- reserve_movements: owners may see movements directly tagged with their owner_id.
-- Movements scoped only by villa/project (no owner_id) remain internal-only —
-- they reach owners through statement_lines instead.
DROP POLICY IF EXISTS owner_self_reserve_read ON reserve_movements;
CREATE POLICY owner_self_reserve_read ON reserve_movements FOR SELECT
USING (
  public.is_internal_user()
  OR (
    owner_id IS NOT NULL
    AND owner_id IN (SELECT public.current_owner_ids())
  )
);

-- =============================================================================
-- 4) expense_allocations: add statement_id (materialisation target)
-- =============================================================================
ALTER TABLE "expense_allocations"
  ADD COLUMN IF NOT EXISTS "statement_id" uuid
  REFERENCES "owner_statements"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "expense_allocations_statement_idx"
  ON "expense_allocations" ("statement_id");

-- =============================================================================
-- 4b) Patch fn_prevent_locked_period_mutation() — go through `to_jsonb` so
--     PL/pgSQL never tries to resolve a column that isn't on the active row
--     type (e.g. NEW.fee_date when the trigger fires on revenue_lines).
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_prevent_locked_period_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rec_json jsonb;
  effective_date date;
  conflict text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec_json := to_jsonb(OLD);
  ELSE
    rec_json := to_jsonb(NEW);
  END IF;

  effective_date := CASE TG_TABLE_NAME
    WHEN 'revenue_lines'        THEN COALESCE((rec_json->>'service_date')::date,    CURRENT_DATE)
    WHEN 'fee_lines'            THEN COALESCE((rec_json->>'fee_date')::date,        CURRENT_DATE)
    WHEN 'expense_lines'        THEN (rec_json->>'expense_date')::date
    WHEN 'tax_lines'            THEN (rec_json->>'tax_date')::date
    WHEN 'reserve_movements'    THEN (rec_json->>'movement_date')::date
    WHEN 'management_fee_lines' THEN (rec_json->>'fee_date')::date
    WHEN 'finance_adjustments'  THEN (rec_json->>'adjustment_date')::date
  END;

  IF effective_date IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT label INTO conflict
    FROM statement_periods
   WHERE status IN ('closed','locked')
     AND effective_date BETWEEN period_start AND period_end
   ORDER BY status DESC
   LIMIT 1;

  IF conflict IS NOT NULL THEN
    RAISE EXCEPTION
      'Period locked: cannot % row in % whose date % falls inside closed/locked period "%". Use a finance_adjustment instead.',
      TG_OP, TG_TABLE_NAME, effective_date, conflict
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END
$$;

-- =============================================================================
-- 5) Reserve balance view
-- =============================================================================
CREATE OR REPLACE VIEW "v_reserve_balances" AS
SELECT
  villa_id,
  project_id,
  owner_id,
  reserve_type,
  currency,
  SUM(CASE WHEN movement_type = 'contribution' THEN amount_minor ELSE 0 END) AS contributions_minor,
  SUM(CASE WHEN movement_type = 'release'      THEN amount_minor ELSE 0 END) AS releases_minor,
  SUM(CASE WHEN movement_type = 'adjustment'   THEN amount_minor ELSE 0 END) AS adjustments_minor,
  SUM(
    CASE
      WHEN movement_type = 'contribution' THEN amount_minor
      WHEN movement_type = 'release'      THEN -amount_minor
      WHEN movement_type = 'adjustment'   THEN amount_minor
      ELSE 0
    END
  ) AS balance_minor,
  MAX(movement_date) AS last_movement_date
FROM reserve_movements
WHERE status = 'posted'
GROUP BY villa_id, project_id, owner_id, reserve_type, currency;

COMMIT;
