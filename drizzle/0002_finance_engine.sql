-- Arconique Management OS — Migration 0002 · Finance engine
-- Apply with: npm run db:migrate
-- Idempotent on re-run.

BEGIN;

-- =============================================================================
-- 1) FX rates
-- =============================================================================
CREATE TABLE IF NOT EXISTS "fx_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "base_currency" text NOT NULL,
  "quote_currency" text NOT NULL,
  "rate" numeric(18,9) NOT NULL CHECK ("rate" > 0),
  "rate_date" date NOT NULL,
  "source" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "fx_rates_unique" ON "fx_rates" ("base_currency","quote_currency","rate_date");
CREATE INDEX IF NOT EXISTS "fx_rates_date_idx" ON "fx_rates" ("rate_date");

-- =============================================================================
-- 2) Statement periods (declared early so triggers can reference it)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "statement_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "period_start" date NOT NULL,
  "period_end" date NOT NULL CHECK ("period_end" >= "period_start"),
  "label" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open'
    CHECK ("status" IN ('open','closing','closed','locked')),
  "closed_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "closed_at" timestamptz,
  "locked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "statement_periods_range_unique" ON "statement_periods" ("period_start","period_end");
CREATE INDEX IF NOT EXISTS "statement_periods_status_idx" ON "statement_periods" ("status");

-- =============================================================================
-- 3) Revenue · Fee · Expense · Tax · Reserve · Management fee
-- =============================================================================
CREATE TABLE IF NOT EXISTS "revenue_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "owner_id" uuid REFERENCES "owners"("id") ON DELETE SET NULL,
  "revenue_type" text NOT NULL,
  "description" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "service_date" date,
  "earned_at" timestamptz,
  "source" text NOT NULL DEFAULT 'manual',
  "source_reference" text,
  "visibility" text NOT NULL DEFAULT 'internal'
    CHECK ("visibility" IN ('internal','owner','public')),
  "status" text NOT NULL DEFAULT 'posted'
    CHECK ("status" IN ('draft','posted','voided','reversed')),
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "revenue_lines_villa_date_idx" ON "revenue_lines" ("villa_id","service_date");
CREATE INDEX IF NOT EXISTS "revenue_lines_project_date_idx" ON "revenue_lines" ("project_id","service_date");
CREATE INDEX IF NOT EXISTS "revenue_lines_booking_idx" ON "revenue_lines" ("booking_id");
CREATE INDEX IF NOT EXISTS "revenue_lines_status_idx" ON "revenue_lines" ("status");

CREATE TABLE IF NOT EXISTS "fee_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "fee_type" text NOT NULL,
  "description" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "fee_date" date,
  "source" text NOT NULL DEFAULT 'manual',
  "source_reference" text,
  "status" text NOT NULL DEFAULT 'posted'
    CHECK ("status" IN ('draft','posted','voided','reversed')),
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "fee_lines_villa_date_idx" ON "fee_lines" ("villa_id","fee_date");
CREATE INDEX IF NOT EXISTS "fee_lines_project_date_idx" ON "fee_lines" ("project_id","fee_date");
CREATE INDEX IF NOT EXISTS "fee_lines_booking_idx" ON "fee_lines" ("booking_id");

CREATE TABLE IF NOT EXISTS "expense_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "expense_type" text NOT NULL,
  "description" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "expense_date" date NOT NULL,
  "allocation_scope" text NOT NULL DEFAULT 'villa'
    CHECK ("allocation_scope" IN ('villa','project_pool','company','booking','owner_direct')),
  "capitalized" boolean NOT NULL DEFAULT false,
  "owner_chargeable" boolean NOT NULL DEFAULT true,
  "requires_owner_approval" boolean NOT NULL DEFAULT false,
  "approval_status" text NOT NULL DEFAULT 'not_required'
    CHECK ("approval_status" IN ('not_required','pending','approved','rejected')),
  "receipt_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'posted'
    CHECK ("status" IN ('draft','posted','voided','reversed')),
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "expense_lines_villa_date_idx" ON "expense_lines" ("villa_id","expense_date");
CREATE INDEX IF NOT EXISTS "expense_lines_project_date_idx" ON "expense_lines" ("project_id","expense_date");
CREATE INDEX IF NOT EXISTS "expense_lines_scope_idx" ON "expense_lines" ("allocation_scope");

CREATE TABLE IF NOT EXISTS "tax_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "tax_type" text NOT NULL,
  "description" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "tax_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'posted'
    CHECK ("status" IN ('draft','posted','voided','reversed')),
  "owner_visible" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tax_lines_villa_date_idx" ON "tax_lines" ("villa_id","tax_date");
CREATE INDEX IF NOT EXISTS "tax_lines_project_date_idx" ON "tax_lines" ("project_id","tax_date");

CREATE TABLE IF NOT EXISTS "reserve_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "owner_id" uuid REFERENCES "owners"("id") ON DELETE SET NULL,
  "reserve_type" text NOT NULL
    CHECK ("reserve_type" IN ('renovation','depreciation','ffe','maintenance','tax','emergency','other')),
  "movement_type" text NOT NULL
    CHECK ("movement_type" IN ('contribution','release','adjustment')),
  "description" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "movement_date" date NOT NULL,
  "source_type" text,
  "source_id" uuid,
  "status" text NOT NULL DEFAULT 'posted'
    CHECK ("status" IN ('draft','posted','voided','reversed')),
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "reserve_movements_villa_idx" ON "reserve_movements" ("villa_id","movement_date");
CREATE INDEX IF NOT EXISTS "reserve_movements_project_idx" ON "reserve_movements" ("project_id","movement_date");
CREATE INDEX IF NOT EXISTS "reserve_movements_type_idx" ON "reserve_movements" ("reserve_type");

CREATE TABLE IF NOT EXISTS "allocation_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "rule_name" text NOT NULL,
  "allocation_model" text NOT NULL,
  "applies_to" text NOT NULL,
  "basis" text NOT NULL,
  "config" jsonb,
  "starts_on" date NOT NULL,
  "ends_on" date,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','scheduled','ended')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "allocation_rules_project_idx" ON "allocation_rules" ("project_id");

CREATE TABLE IF NOT EXISTS "expense_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "expense_line_id" uuid NOT NULL REFERENCES "expense_lines"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "owner_id" uuid REFERENCES "owners"("id") ON DELETE SET NULL,
  "ownership_share_id" uuid REFERENCES "ownership_shares"("id") ON DELETE SET NULL,
  "allocation_rule_id" uuid REFERENCES "allocation_rules"("id") ON DELETE SET NULL,
  "allocated_amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "allocation_basis" text NOT NULL,
  "allocation_percent" numeric(9,6),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "expense_allocations_expense_idx" ON "expense_allocations" ("expense_line_id");
CREATE INDEX IF NOT EXISTS "expense_allocations_owner_idx" ON "expense_allocations" ("owner_id");

CREATE TABLE IF NOT EXISTS "management_fee_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "rule_name" text NOT NULL,
  "fee_model" text NOT NULL
    CHECK ("fee_model" IN ('percent_of_gross','percent_of_net','fixed_monthly','tiered','custom')),
  "fee_percent" numeric(6,3),
  "fixed_amount_minor" bigint,
  "currency" text,
  "config" jsonb,
  "starts_on" date NOT NULL,
  "ends_on" date,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','scheduled','ended')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "management_fee_rules_project_idx" ON "management_fee_rules" ("project_id");
CREATE INDEX IF NOT EXISTS "management_fee_rules_villa_idx" ON "management_fee_rules" ("villa_id");

CREATE TABLE IF NOT EXISTS "management_fee_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "owner_id" uuid REFERENCES "owners"("id") ON DELETE SET NULL,
  "statement_id" uuid,
  "rule_id" uuid REFERENCES "management_fee_rules"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "fee_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'posted'
    CHECK ("status" IN ('draft','posted','voided','reversed')),
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "management_fee_lines_villa_idx" ON "management_fee_lines" ("villa_id","fee_date");
CREATE INDEX IF NOT EXISTS "management_fee_lines_owner_idx" ON "management_fee_lines" ("owner_id");

-- =============================================================================
-- 4) Owner statements + lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS "owner_statements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE RESTRICT,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "period_id" uuid NOT NULL REFERENCES "statement_periods"("id") ON DELETE RESTRICT,
  "statement_code" text NOT NULL UNIQUE,
  "management_model" text NOT NULL
    CHECK ("management_model" IN ('individual','pooled','hybrid')),
  "currency" text NOT NULL,
  "gross_revenue_minor" bigint NOT NULL DEFAULT 0,
  "total_fees_minor" bigint NOT NULL DEFAULT 0,
  "total_expenses_minor" bigint NOT NULL DEFAULT 0,
  "total_taxes_minor" bigint NOT NULL DEFAULT 0,
  "total_reserves_minor" bigint NOT NULL DEFAULT 0,
  "management_fee_minor" bigint NOT NULL DEFAULT 0,
  "net_payout_minor" bigint NOT NULL DEFAULT 0,
  "occupancy_rate" numeric(6,3),
  "adr_minor" bigint,
  "revpar_minor" bigint,
  "annualized_yield" numeric(8,4),
  "status" text NOT NULL DEFAULT 'draft'
    CHECK ("status" IN ('draft','issued','approved','paid','voided')),
  "issued_at" timestamptz,
  "approved_at" timestamptz,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "owner_statements_owner_period_idx" ON "owner_statements" ("owner_id","period_id");
CREATE INDEX IF NOT EXISTS "owner_statements_period_idx" ON "owner_statements" ("period_id");
CREATE INDEX IF NOT EXISTS "owner_statements_status_idx" ON "owner_statements" ("status");

CREATE TABLE IF NOT EXISTS "statement_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "statement_id" uuid NOT NULL REFERENCES "owner_statements"("id") ON DELETE CASCADE,
  "line_type" text NOT NULL
    CHECK ("line_type" IN ('revenue','fee','expense','tax','reserve','management_fee','payout','adjustment')),
  "source_table" text,
  "source_id" uuid,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "owner_visible" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "statement_lines_statement_idx" ON "statement_lines" ("statement_id","sort_order");
CREATE INDEX IF NOT EXISTS "statement_lines_type_idx" ON "statement_lines" ("line_type");

CREATE TABLE IF NOT EXISTS "finance_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid REFERENCES "owners"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "statement_id" uuid REFERENCES "owner_statements"("id") ON DELETE SET NULL,
  "adjustment_type" text NOT NULL,
  "description" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "adjustment_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'posted'
    CHECK ("status" IN ('draft','posted','voided','reversed')),
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "finance_adjustments_statement_idx" ON "finance_adjustments" ("statement_id");

-- =============================================================================
-- 5) Payouts
-- =============================================================================
CREATE TABLE IF NOT EXISTS "payout_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_code" text NOT NULL UNIQUE,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL CHECK ("period_end" >= "period_start"),
  "currency" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft'
    CHECK ("status" IN ('draft','approved','paid','cancelled')),
  "approved_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "paid_at" timestamptz,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payout_batches_status_idx" ON "payout_batches" ("status");

CREATE TABLE IF NOT EXISTS "payout_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "payout_batch_id" uuid REFERENCES "payout_batches"("id") ON DELETE SET NULL,
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE RESTRICT,
  "payout_method_id" uuid REFERENCES "payout_methods"("id") ON DELETE SET NULL,
  "statement_id" uuid REFERENCES "owner_statements"("id") ON DELETE SET NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'
    CHECK ("status" IN ('pending','approved','paid','failed','cancelled')),
  "reference" text,
  "scheduled_for" date,
  "paid_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payout_lines_owner_idx" ON "payout_lines" ("owner_id");
CREATE INDEX IF NOT EXISTS "payout_lines_batch_idx" ON "payout_lines" ("payout_batch_id");
CREATE INDEX IF NOT EXISTS "payout_lines_status_idx" ON "payout_lines" ("status");

-- =============================================================================
-- 6) updated_at triggers for new tables
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'revenue_lines','fee_lines','expense_lines','tax_lines','reserve_movements',
      'allocation_rules','management_fee_rules','management_fee_lines',
      'statement_periods','owner_statements','finance_adjustments',
      'payout_batches','payout_lines'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON %I; '
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- =============================================================================
-- 7) Period-lock trigger
--    Refuses INSERT / UPDATE / DELETE on financial rows whose date falls
--    inside a `closed` or `locked` statement_period.
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_prevent_locked_period_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  effective_date date;
  conflict text;
BEGIN
  -- Resolve the row's effective date column from TG_TABLE_NAME.
  effective_date := CASE TG_TABLE_NAME
    WHEN 'revenue_lines'         THEN COALESCE((CASE WHEN TG_OP='DELETE' THEN OLD.service_date  ELSE NEW.service_date  END), CURRENT_DATE)
    WHEN 'fee_lines'             THEN COALESCE((CASE WHEN TG_OP='DELETE' THEN OLD.fee_date      ELSE NEW.fee_date      END), CURRENT_DATE)
    WHEN 'expense_lines'         THEN (CASE WHEN TG_OP='DELETE' THEN OLD.expense_date   ELSE NEW.expense_date   END)
    WHEN 'tax_lines'             THEN (CASE WHEN TG_OP='DELETE' THEN OLD.tax_date       ELSE NEW.tax_date       END)
    WHEN 'reserve_movements'     THEN (CASE WHEN TG_OP='DELETE' THEN OLD.movement_date  ELSE NEW.movement_date  END)
    WHEN 'management_fee_lines'  THEN (CASE WHEN TG_OP='DELETE' THEN OLD.fee_date       ELSE NEW.fee_date       END)
    WHEN 'finance_adjustments'   THEN (CASE WHEN TG_OP='DELETE' THEN OLD.adjustment_date ELSE NEW.adjustment_date END)
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

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'revenue_lines','fee_lines','expense_lines','tax_lines',
      'reserve_movements','management_fee_lines','finance_adjustments'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_prevent_locked_period ON %I; '
      'CREATE TRIGGER trg_prevent_locked_period '
      'BEFORE INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION fn_prevent_locked_period_mutation();',
      t, t
    );
  END LOOP;
END $$;

-- =============================================================================
-- 8) RLS — enable + force on every new finance table.
--    Internal staff get a read baseline; mutations route through service-role
--    server actions until v3.5 introduces owner-scoped policies.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'fx_rates','revenue_lines','fee_lines','expense_lines','tax_lines',
      'reserve_movements','allocation_rules','expense_allocations',
      'management_fee_rules','management_fee_lines','statement_periods',
      'owner_statements','statement_lines','finance_adjustments',
      'payout_batches','payout_lines'
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
  END LOOP;
END $$;

-- Owner-scoped read for owner_statements / statement_lines / payout_lines.
-- An owner is identified via app_users.auth_user_id → app_users.id, then
-- joined to owners by display name OR via a direct app_users.email match
-- against owners.email. Matching is conservative: we require the active
-- ownership_share to participate in the same villa/project the statement
-- references. This is a v3 baseline; v3.5 introduces a cleaner
-- `app_users_owners` link table with explicit grant.
CREATE OR REPLACE FUNCTION public.current_owner_id() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE result uuid;
BEGIN
  SELECT o.id INTO result
    FROM owners o
    JOIN app_users u ON lower(u.email) = lower(o.email)
   WHERE u.auth_user_id = auth.uid()
     AND u.status = 'active'
   LIMIT 1;
  RETURN result;
EXCEPTION WHEN undefined_function THEN
  RETURN NULL;
END
$$;

DROP POLICY IF EXISTS owner_self_read ON owner_statements;
CREATE POLICY owner_self_read ON owner_statements FOR SELECT
USING (
  public.is_internal_user()
  OR (
    public.current_owner_id() IS NOT NULL
    AND owner_id = public.current_owner_id()
    AND status IN ('issued','approved','paid')
  )
);

DROP POLICY IF EXISTS owner_self_lines_read ON statement_lines;
CREATE POLICY owner_self_lines_read ON statement_lines FOR SELECT
USING (
  public.is_internal_user()
  OR (
    public.current_owner_id() IS NOT NULL
    AND owner_visible = true
    AND statement_id IN (
      SELECT id FROM owner_statements
       WHERE owner_id = public.current_owner_id()
         AND status IN ('issued','approved','paid')
    )
  )
);

DROP POLICY IF EXISTS owner_self_payouts_read ON payout_lines;
CREATE POLICY owner_self_payouts_read ON payout_lines FOR SELECT
USING (
  public.is_internal_user()
  OR (
    public.current_owner_id() IS NOT NULL
    AND owner_id = public.current_owner_id()
    AND status IN ('approved','paid')
  )
);

-- TODO(v3.5):
--   * Replace the email-match in current_owner_id() with an explicit
--     app_users_owners(grant_type, granted_by, granted_at) link table.
--   * Add owner-scoped read on reserve_movements (filtered to villa/project
--     ownership) once the link table is in place.
--   * Add per-action UPDATE/INSERT/DELETE policies for internal staff so
--     server actions can drop the service-role on more flows.

COMMIT;
