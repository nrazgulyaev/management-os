-- =============================================================================
-- 0049 — Development OS · Stage 4.B.2 — Capital Account Refinement +
--                                       Residual Inventory
--
-- Schema-name reconciliation:
--   - spec uses `commitments(id)` and `drawdowns(id)` — actual tables are
--     `capital_commitments` and `capital_drawdowns`.
--   - spec uses `units(id)` — actual table is `villas` (units in the schema
--     are villas in this codebase).
--
-- Three new tables + extends investor_wallets:
--   - investor_wallets: 6 new bucket columns + last_recomputed_at
--   - wallet_movements: append-only log of bucket-affecting changes
--   - residual_inventory_units: villa records after project completion
--   - residual_unit_ownership_shares: arconique vs investor allocation
--                                     (sum-to-100 trigger)
--
-- All RLS-protected with public.is_internal_user() + investor read-own.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) Extend investor_wallets with 6 new bucket columns
-- =============================================================================

ALTER TABLE "investor_wallets"
  ADD COLUMN IF NOT EXISTS "cash_balance_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "economic_balance_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reinvestment_balance_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "committed_balance_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pending_distribution_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "residual_inventory_value_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_recomputed_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "investor_wallets_economic_idx"
  ON "investor_wallets"("economic_balance_minor");

-- =============================================================================
-- 2) wallet_movements — append-only audit log
-- =============================================================================

CREATE TABLE IF NOT EXISTS "wallet_movements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "wallet_id" UUID NOT NULL REFERENCES "investor_wallets"("id") ON DELETE CASCADE,
  "investor_id" UUID NOT NULL REFERENCES "investors"("id"),

  "movement_type" TEXT NOT NULL CHECK ("movement_type" IN (
    'capital_contribution',
    'capital_return',
    'profit_distribution',
    'reinvestment_out',
    'reinvestment_in',
    'withdrawal_request',
    'withdrawal_executed',
    'manual_adjustment',
    'residual_inventory_realloc'
  )),

  "amount_minor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "fx_rate_to_usd" NUMERIC(15,8) NOT NULL DEFAULT 1.0,

  "affects_balance" TEXT NOT NULL CHECK ("affects_balance" IN (
    'cash', 'economic', 'reinvestment', 'committed', 'pending_distribution', 'residual_inventory'
  )),

  "source_project_id" UUID REFERENCES "projects"("id"),
  "target_project_id" UUID REFERENCES "projects"("id"),
  "related_distribution_id" UUID REFERENCES "distributions"("id"),
  "related_commitment_id" UUID REFERENCES "capital_commitments"("id"),
  "related_drawdown_id" UUID REFERENCES "capital_drawdowns"("id"),
  "related_residual_unit_id" UUID,                        -- forward ref; FK added later

  "status" TEXT NOT NULL DEFAULT 'recorded' CHECK ("status" IN (
    'recorded', 'pending', 'reversed', 'voided'
  )),

  "effected_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "effected_by" UUID REFERENCES "app_users"("id"),
  "reason" TEXT,
  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "wallet_movements_wallet_idx"
  ON "wallet_movements"("wallet_id");
CREATE INDEX IF NOT EXISTS "wallet_movements_investor_idx"
  ON "wallet_movements"("investor_id");
CREATE INDEX IF NOT EXISTS "wallet_movements_type_idx"
  ON "wallet_movements"("movement_type");
CREATE INDEX IF NOT EXISTS "wallet_movements_effected_idx"
  ON "wallet_movements"("effected_at" DESC);
CREATE INDEX IF NOT EXISTS "wallet_movements_source_project_idx"
  ON "wallet_movements"("source_project_id");
CREATE INDEX IF NOT EXISTS "wallet_movements_target_project_idx"
  ON "wallet_movements"("target_project_id");

CREATE OR REPLACE FUNCTION "wallet_movements_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_wallet_movements_updated_at" ON "wallet_movements";
CREATE TRIGGER "trg_wallet_movements_updated_at"
  BEFORE UPDATE ON "wallet_movements"
  FOR EACH ROW EXECUTE FUNCTION "wallet_movements_set_updated_at"();


-- =============================================================================
-- 3) residual_inventory_units — unsold villas after project completion
-- =============================================================================

CREATE TABLE IF NOT EXISTS "residual_inventory_units" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- spec: units(id) → in this codebase, villas(id)
  "unit_id" UUID UNIQUE NOT NULL REFERENCES "villas"("id"),
  "project_id" UUID NOT NULL REFERENCES "projects"("id"),

  "status" TEXT NOT NULL DEFAULT 'unsold' CHECK ("status" IN (
    'unsold', 'held', 'transferred_to_management', 'sold_later', 'reallocated'
  )),

  "became_residual_at" DATE NOT NULL,
  "activation_reason" TEXT,

  "list_price_minor" BIGINT,
  "current_market_value_minor" BIGINT,
  "conservative_liquidation_value_minor" BIGINT,
  "internal_minimum_sale_price_minor" BIGINT,
  "rental_income_valuation_minor" BIGINT,
  "manual_valuation_minor" BIGINT,

  "active_valuation_method" TEXT NOT NULL DEFAULT 'current_market_value'
    CHECK ("active_valuation_method" IN (
      'list_price', 'current_market_value', 'conservative_liquidation_value',
      'internal_minimum_sale_price', 'rental_income_valuation', 'manual_valuation'
    )),
  "active_valuation_minor" BIGINT NOT NULL,
  "active_valuation_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "active_valuation_source" TEXT,

  "currency" TEXT NOT NULL DEFAULT 'USD',

  "transferred_to_management_at" TIMESTAMPTZ,
  "sold_at" TIMESTAMPTZ,
  "sold_price_minor" BIGINT,

  "notes" TEXT,
  "internal_notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "residual_inventory_units_project_idx"
  ON "residual_inventory_units"("project_id");
CREATE INDEX IF NOT EXISTS "residual_inventory_units_status_idx"
  ON "residual_inventory_units"("status");

CREATE OR REPLACE FUNCTION "residual_inventory_units_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_residual_inventory_units_updated_at"
  ON "residual_inventory_units";
CREATE TRIGGER "trg_residual_inventory_units_updated_at"
  BEFORE UPDATE ON "residual_inventory_units"
  FOR EACH ROW EXECUTE FUNCTION "residual_inventory_units_set_updated_at"();

-- Now we can add the FK from wallet_movements.related_residual_unit_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallet_movements_related_residual_unit_id_fkey'
  ) THEN
    ALTER TABLE "wallet_movements"
      ADD CONSTRAINT "wallet_movements_related_residual_unit_id_fkey"
      FOREIGN KEY ("related_residual_unit_id")
      REFERENCES "residual_inventory_units"("id");
  END IF;
END $$;


-- =============================================================================
-- 4) residual_unit_ownership_shares — sum-to-100% per unit
-- =============================================================================

CREATE TABLE IF NOT EXISTS "residual_unit_ownership_shares" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "residual_unit_id" UUID NOT NULL
    REFERENCES "residual_inventory_units"("id") ON DELETE CASCADE,

  "arconique_share" BOOLEAN NOT NULL DEFAULT FALSE,
  "investor_id" UUID REFERENCES "investors"("id"),

  "ownership_percentage" NUMERIC(7,4) NOT NULL
    CHECK ("ownership_percentage" > 0 AND "ownership_percentage" <= 100),
  "economic_claim_minor" BIGINT NOT NULL,

  "settlement_method" TEXT NOT NULL CHECK ("settlement_method" IN (
    'by_unrecovered_capital',
    'by_economic_waterfall',
    'by_arconique_25_credit',
    'manual_override'
  )),
  "settlement_basis" JSONB,

  "is_approved" BOOLEAN NOT NULL DEFAULT FALSE,
  "approved_at" TIMESTAMPTZ,
  "approved_by" UUID REFERENCES "app_users"("id"),
  "approval_reason" TEXT,

  "effective_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "residual_unit_ownership_shares_owner_xor" CHECK (
    (arconique_share = TRUE AND investor_id IS NULL) OR
    (arconique_share = FALSE AND investor_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "residual_unit_ownership_shares_unit_idx"
  ON "residual_unit_ownership_shares"("residual_unit_id");
CREATE INDEX IF NOT EXISTS "residual_unit_ownership_shares_investor_idx"
  ON "residual_unit_ownership_shares"("investor_id");

-- Sum-to-100% per residual unit (DEFERRABLE).
CREATE OR REPLACE FUNCTION "check_residual_ownership_sum"()
RETURNS TRIGGER AS $$
DECLARE
  total_pct NUMERIC;
  u_id UUID;
BEGIN
  u_id := COALESCE(NEW."residual_unit_id", OLD."residual_unit_id");
  SELECT SUM("ownership_percentage") INTO total_pct
    FROM "residual_unit_ownership_shares"
   WHERE "residual_unit_id" = u_id;
  IF total_pct IS NOT NULL AND ABS(total_pct - 100) > 0.001 THEN
    RAISE EXCEPTION 'residual_unit_ownership_shares must sum to exactly 100%% per unit, got %', total_pct;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_check_residual_ownership_sum"
  ON "residual_unit_ownership_shares";
CREATE CONSTRAINT TRIGGER "trg_check_residual_ownership_sum"
  AFTER INSERT OR UPDATE OR DELETE ON "residual_unit_ownership_shares"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_residual_ownership_sum"();

CREATE OR REPLACE FUNCTION "residual_unit_ownership_shares_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_residual_unit_ownership_shares_updated_at"
  ON "residual_unit_ownership_shares";
CREATE TRIGGER "trg_residual_unit_ownership_shares_updated_at"
  BEFORE UPDATE ON "residual_unit_ownership_shares"
  FOR EACH ROW EXECUTE FUNCTION "residual_unit_ownership_shares_set_updated_at"();


-- =============================================================================
-- 5) RLS — internal default; investor read-own for movements + residual
-- =============================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'wallet_movements',
      'residual_inventory_units',
      'residual_unit_ownership_shares'
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

-- Investors read own wallet_movements.
DROP POLICY IF EXISTS wallet_movements_investor_read ON "wallet_movements";
CREATE POLICY wallet_movements_investor_read ON "wallet_movements"
  FOR SELECT
  USING (
    public.is_internal_user() OR
    (public.is_investor_user() AND investor_id = public.current_investor_id())
  );

-- Investors read own residual ownership shares.
DROP POLICY IF EXISTS residual_unit_ownership_shares_investor_read
  ON "residual_unit_ownership_shares";
CREATE POLICY residual_unit_ownership_shares_investor_read
  ON "residual_unit_ownership_shares"
  FOR SELECT
  USING (
    public.is_internal_user() OR
    (public.is_investor_user() AND investor_id = public.current_investor_id())
  );

-- residual_inventory_units stays internal-only (investors don't see raw
-- valuation snapshots; they see their share via the previous policy).

COMMIT;
