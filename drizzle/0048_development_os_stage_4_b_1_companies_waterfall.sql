-- =============================================================================
-- 0048 — Development OS · Stage 4.B.1 — Company Structure + Waterfall Engine
--
-- Three new tables:
--   - project_company_structures      SPV / company structure per project
--   - company_structure_shareholders  ownership %s per structure (sum-to-100 trigger)
--   - waterfall_rules                 custom waterfall rules per project XOR commitment
--
-- All RLS-protected with public.is_internal_user() policies.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) project_company_structures — one active structure per project at a time
-- =============================================================================

CREATE TABLE IF NOT EXISTS "project_company_structures" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,

  "structure_label" TEXT NOT NULL,
  "structure_type" TEXT NOT NULL CHECK ("structure_type" IN (
    'arconique_owned',
    'klr_real_estate',
    'new_spv',
    'joint_venture',
    'landowner_partnership',
    'nominee_structure',
    'custom'
  )),

  "company_name" TEXT,
  "company_registration_number" TEXT,
  "country" TEXT,
  "region" TEXT,
  "registration_status" TEXT NOT NULL DEFAULT 'planned' CHECK ("registration_status" IN (
    'planned', 'in_progress', 'registered', 'dissolved', 'on_hold'
  )),
  "registration_date" DATE,
  "dissolution_date" DATE,

  "setup_cost_minor" BIGINT,
  "setup_currency" TEXT DEFAULT 'USD',
  "responsible_legal_consultant" TEXT,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "effective_from" DATE NOT NULL DEFAULT CURRENT_DATE,
  "effective_until" DATE,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "project_company_structures_project_idx"
  ON "project_company_structures"("project_id");
CREATE INDEX IF NOT EXISTS "project_company_structures_active_idx"
  ON "project_company_structures"("is_active");

-- Only one active structure per project at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "project_company_structures_active_unique"
  ON "project_company_structures"("project_id")
  WHERE "is_active" = TRUE;

CREATE OR REPLACE FUNCTION "project_company_structures_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_project_company_structures_updated_at"
  ON "project_company_structures";
CREATE TRIGGER "trg_project_company_structures_updated_at"
  BEFORE UPDATE ON "project_company_structures"
  FOR EACH ROW EXECUTE FUNCTION "project_company_structures_set_updated_at"();


-- =============================================================================
-- 2) company_structure_shareholders — sum-to-100% per structure
-- =============================================================================

CREATE TABLE IF NOT EXISTS "company_structure_shareholders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "structure_id" UUID NOT NULL REFERENCES "project_company_structures"("id") ON DELETE CASCADE,

  "shareholder_type" TEXT NOT NULL CHECK ("shareholder_type" IN (
    'arconique', 'investor', 'klr_real_estate', 'land_owner', 'external_party'
  )),

  "investor_id" UUID REFERENCES "investors"("id"),

  "display_name" TEXT NOT NULL,

  "ownership_percentage" NUMERIC(7,4) NOT NULL
    CHECK ("ownership_percentage" > 0 AND "ownership_percentage" <= 100),

  "role_in_company" TEXT,
  "is_managing_party" BOOLEAN NOT NULL DEFAULT FALSE,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "company_structure_shareholders_structure_idx"
  ON "company_structure_shareholders"("structure_id");
CREATE INDEX IF NOT EXISTS "company_structure_shareholders_investor_idx"
  ON "company_structure_shareholders"("investor_id");

-- Sum-to-100 enforcement (DEFERRABLE: validate at COMMIT, not per row).
CREATE OR REPLACE FUNCTION "check_shareholder_sum"()
RETURNS TRIGGER AS $$
DECLARE
  total_pct NUMERIC;
  s_id UUID;
BEGIN
  s_id := COALESCE(NEW."structure_id", OLD."structure_id");
  SELECT SUM("ownership_percentage") INTO total_pct
    FROM "company_structure_shareholders"
   WHERE "structure_id" = s_id;
  IF total_pct IS NOT NULL AND ABS(total_pct - 100) > 0.001 THEN
    RAISE EXCEPTION 'company_structure_shareholders must sum to exactly 100%% per structure, got %', total_pct;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_check_shareholder_sum"
  ON "company_structure_shareholders";
CREATE CONSTRAINT TRIGGER "trg_check_shareholder_sum"
  AFTER INSERT OR UPDATE OR DELETE ON "company_structure_shareholders"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_shareholder_sum"();

CREATE OR REPLACE FUNCTION "company_structure_shareholders_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_company_structure_shareholders_updated_at"
  ON "company_structure_shareholders";
CREATE TRIGGER "trg_company_structure_shareholders_updated_at"
  BEFORE UPDATE ON "company_structure_shareholders"
  FOR EACH ROW EXECUTE FUNCTION "company_structure_shareholders_set_updated_at"();


-- =============================================================================
-- 3) waterfall_rules — project XOR commitment scope
-- =============================================================================

CREATE TABLE IF NOT EXISTS "waterfall_rules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "scope" TEXT NOT NULL CHECK ("scope" IN ('project', 'commitment')),
  "project_id" UUID REFERENCES "projects"("id"),
  "commitment_id" UUID REFERENCES "capital_commitments"("id"),

  "rule_label" TEXT NOT NULL,
  "rule_type" TEXT NOT NULL CHECK ("rule_type" IN (
    'generic_50_50',
    'arconique_25_credit',
    'preferred_return_then_split',
    'waterfall_with_hurdle',
    'capital_first_then_split',
    'tiered_promote',
    'custom'
  )),

  "rule_parameters" JSONB NOT NULL DEFAULT '{}'::jsonb,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "effective_from" DATE NOT NULL DEFAULT CURRENT_DATE,
  "effective_until" DATE,

  "description" TEXT,
  "legal_reference" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Scope is mutually exclusive: one and only one of (project_id, commitment_id).
  CONSTRAINT "waterfall_rules_scope_xor" CHECK (
    (scope = 'project' AND project_id IS NOT NULL AND commitment_id IS NULL) OR
    (scope = 'commitment' AND commitment_id IS NOT NULL AND project_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS "waterfall_rules_project_idx"
  ON "waterfall_rules"("project_id");
CREATE INDEX IF NOT EXISTS "waterfall_rules_commitment_idx"
  ON "waterfall_rules"("commitment_id");
CREATE INDEX IF NOT EXISTS "waterfall_rules_active_idx"
  ON "waterfall_rules"("is_active");
CREATE INDEX IF NOT EXISTS "waterfall_rules_type_idx"
  ON "waterfall_rules"("rule_type");

CREATE OR REPLACE FUNCTION "waterfall_rules_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_waterfall_rules_updated_at" ON "waterfall_rules";
CREATE TRIGGER "trg_waterfall_rules_updated_at"
  BEFORE UPDATE ON "waterfall_rules"
  FOR EACH ROW EXECUTE FUNCTION "waterfall_rules_set_updated_at"();


-- =============================================================================
-- 4) RLS — internal-only by default; investor read-own for waterfall_rules
-- =============================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'project_company_structures',
      'company_structure_shareholders',
      'waterfall_rules'
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

-- Investors can read waterfall_rules for their own commitments only.
-- Stage 2.3.C established public.current_investor_id() — use it here.
DROP POLICY IF EXISTS waterfall_rules_investor_read ON "waterfall_rules";
CREATE POLICY waterfall_rules_investor_read ON "waterfall_rules"
  FOR SELECT
  USING (
    public.is_internal_user() OR
    (
      public.is_investor_user() AND
      commitment_id IS NOT NULL AND
      commitment_id IN (
        SELECT cc.id FROM capital_commitments cc
         WHERE cc.investor_id = public.current_investor_id()
      )
    )
  );

COMMIT;
