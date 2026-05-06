-- =============================================================================
-- 0050 — Development OS · Stage 4.B.3 — Buyer Portal + Investor Write Surfaces
--
-- Schema-name reconciliation:
--   - spec uses `units(id)` — actual table is `villas` in this codebase.
--
-- Four new tables:
--   - buyers                       buyer profile + portal access state
--   - buyer_unit_assignments       which buyer owns which villa
--   - buyer_progress_reports       curated reports (operator-approved before published)
--   - investor_portal_requests     withdrawal/reinvest/transfer requests with HITL flow
--
-- RLS:
--   - buyers + buyer_unit_assignments + buyer_progress_reports — buyers
--     can read only own rows (RLS keyed on supabase_user_id).
--   - investor_portal_requests — investors read own + insert own.
--   - All tables: internal staff bypass via is_internal_user().
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) buyers — buyer profile + portal access
-- =============================================================================

CREATE TABLE IF NOT EXISTS "buyers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "buyer_code" TEXT UNIQUE NOT NULL,        -- BYR-001

  "contact_id" UUID REFERENCES "contacts"("id"),

  "display_name" TEXT NOT NULL,
  "primary_email" TEXT,
  "primary_phone" TEXT,
  "whatsapp_phone" TEXT,
  "preferred_language" TEXT NOT NULL DEFAULT 'en',

  "kyc_status" TEXT NOT NULL DEFAULT 'not_started' CHECK ("kyc_status" IN (
    'not_started', 'in_progress', 'submitted', 'verified', 'rejected', 'expired'
  )),
  "kyc_completed_at" TIMESTAMPTZ,

  "supabase_user_id" UUID,                  -- once buyer activates portal account
  "portal_access_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "portal_invited_at" TIMESTAMPTZ,
  "portal_first_login_at" TIMESTAMPTZ,
  "portal_last_login_at" TIMESTAMPTZ,

  "internal_notes" TEXT,                    -- never exposed to buyer portal

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "buyers_supabase_user_idx"
  ON "buyers"("supabase_user_id") WHERE "supabase_user_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "buyers_kyc_status_idx" ON "buyers"("kyc_status");
CREATE INDEX IF NOT EXISTS "buyers_contact_idx" ON "buyers"("contact_id");

CREATE OR REPLACE FUNCTION "buyers_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_buyers_updated_at" ON "buyers";
CREATE TRIGGER "trg_buyers_updated_at"
  BEFORE UPDATE ON "buyers"
  FOR EACH ROW EXECUTE FUNCTION "buyers_set_updated_at"();


-- =============================================================================
-- 2) buyer_unit_assignments — buyers ↔ villas
-- =============================================================================
-- spec: units(id) → in this codebase, villas(id).

CREATE TABLE IF NOT EXISTS "buyer_unit_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "buyer_id" UUID NOT NULL REFERENCES "buyers"("id") ON DELETE CASCADE,
  "unit_id" UUID NOT NULL REFERENCES "villas"("id"),

  "status" TEXT NOT NULL DEFAULT 'reserved' CHECK ("status" IN (
    'reserved', 'contracted', 'paying', 'paid_in_full', 'handed_over', 'cancelled'
  )),

  "reservation_id" UUID REFERENCES "reservations"("id"),
  "contract_id" UUID REFERENCES "contracts"("id"),

  "assigned_at" DATE NOT NULL DEFAULT CURRENT_DATE,
  "contracted_at" DATE,
  "handed_over_at" DATE,

  "is_visible_in_portal" BOOLEAN NOT NULL DEFAULT TRUE,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("buyer_id", "unit_id")
);

CREATE INDEX IF NOT EXISTS "buyer_unit_assignments_buyer_idx"
  ON "buyer_unit_assignments"("buyer_id");
CREATE INDEX IF NOT EXISTS "buyer_unit_assignments_unit_idx"
  ON "buyer_unit_assignments"("unit_id");
CREATE INDEX IF NOT EXISTS "buyer_unit_assignments_status_idx"
  ON "buyer_unit_assignments"("status");

CREATE OR REPLACE FUNCTION "buyer_unit_assignments_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_buyer_unit_assignments_updated_at"
  ON "buyer_unit_assignments";
CREATE TRIGGER "trg_buyer_unit_assignments_updated_at"
  BEFORE UPDATE ON "buyer_unit_assignments"
  FOR EACH ROW EXECUTE FUNCTION "buyer_unit_assignments_set_updated_at"();


-- =============================================================================
-- 3) buyer_progress_reports — curated reports
-- =============================================================================

CREATE TABLE IF NOT EXISTS "buyer_progress_reports" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "unit_id" UUID REFERENCES "villas"("id"),     -- NULL → project-level report
  "project_id" UUID NOT NULL REFERENCES "projects"("id"),

  "reporting_period_start" DATE NOT NULL,
  "reporting_period_end" DATE NOT NULL,

  "current_progress_percentage" NUMERIC(5,2),
  "works_completed_summary" TEXT,
  "works_planned_summary" TEXT,
  "next_milestone" TEXT,
  "expected_handover_date" DATE,
  "budget_progress_confidence" TEXT
    CHECK ("budget_progress_confidence" IN ('high', 'medium', 'low')),
  "highlighted_risks" TEXT,
  "management_commentary" TEXT,

  -- Curated photos (selected from site reports)
  "curated_photo_ids" UUID[],

  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN (
    'draft', 'pending_approval', 'approved', 'published', 'archived'
  )),

  "approved_by" UUID REFERENCES "app_users"("id"),
  "approved_at" TIMESTAMPTZ,
  "published_at" TIMESTAMPTZ,

  "notes" TEXT,
  "internal_notes" TEXT,                       -- never exposed to buyer portal

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "buyer_progress_reports_unit_idx"
  ON "buyer_progress_reports"("unit_id");
CREATE INDEX IF NOT EXISTS "buyer_progress_reports_project_idx"
  ON "buyer_progress_reports"("project_id");
CREATE INDEX IF NOT EXISTS "buyer_progress_reports_status_idx"
  ON "buyer_progress_reports"("status");
CREATE INDEX IF NOT EXISTS "buyer_progress_reports_period_idx"
  ON "buyer_progress_reports"("reporting_period_start", "reporting_period_end");

CREATE OR REPLACE FUNCTION "buyer_progress_reports_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_buyer_progress_reports_updated_at"
  ON "buyer_progress_reports";
CREATE TRIGGER "trg_buyer_progress_reports_updated_at"
  BEFORE UPDATE ON "buyer_progress_reports"
  FOR EACH ROW EXECUTE FUNCTION "buyer_progress_reports_set_updated_at"();


-- =============================================================================
-- 4) investor_portal_requests — HITL-approved investor write surface
-- =============================================================================

CREATE TABLE IF NOT EXISTS "investor_portal_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "investor_id" UUID NOT NULL REFERENCES "investors"("id"),
  "request_code" TEXT UNIQUE NOT NULL,         -- IRQ-2026-0001

  "request_type" TEXT NOT NULL CHECK ("request_type" IN (
    'withdrawal',
    'reinvest_to_project',
    'transfer_between_projects',
    'capital_call_response'
  )),

  "requested_amount_minor" BIGINT NOT NULL CHECK ("requested_amount_minor" > 0),
  "currency" TEXT NOT NULL DEFAULT 'USD',

  "source_project_id" UUID REFERENCES "projects"("id"),
  "target_project_id" UUID REFERENCES "projects"("id"),
  "related_distribution_id" UUID REFERENCES "distributions"("id"),
  "related_commitment_id" UUID REFERENCES "capital_commitments"("id"),

  "investor_notes" TEXT,
  "preferred_execution_date" DATE,

  "status" TEXT NOT NULL DEFAULT 'submitted' CHECK ("status" IN (
    'submitted', 'under_review', 'approved', 'executed', 'rejected', 'cancelled'
  )),

  "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by" UUID REFERENCES "app_users"("id"),
  "approval_notes" TEXT,
  "rejection_reason" TEXT,
  "executed_at" TIMESTAMPTZ,
  "related_wallet_movement_id" UUID REFERENCES "wallet_movements"("id"),

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "investor_portal_requests_investor_idx"
  ON "investor_portal_requests"("investor_id");
CREATE INDEX IF NOT EXISTS "investor_portal_requests_status_idx"
  ON "investor_portal_requests"("status");
CREATE INDEX IF NOT EXISTS "investor_portal_requests_type_idx"
  ON "investor_portal_requests"("request_type");
CREATE INDEX IF NOT EXISTS "investor_portal_requests_submitted_idx"
  ON "investor_portal_requests"("submitted_at" DESC);

CREATE OR REPLACE FUNCTION "investor_portal_requests_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_investor_portal_requests_updated_at"
  ON "investor_portal_requests";
CREATE TRIGGER "trg_investor_portal_requests_updated_at"
  BEFORE UPDATE ON "investor_portal_requests"
  FOR EACH ROW EXECUTE FUNCTION "investor_portal_requests_set_updated_at"();


-- =============================================================================
-- 5) Helper function — public.current_buyer_id()
-- =============================================================================
-- Buyers are authenticated by their supabase_user_id directly (no app_users
-- mediation, since they live in their own workspace). We add a SECURITY
-- DEFINER function so RLS policies can check is-it-my-row cheaply.

CREATE OR REPLACE FUNCTION public.is_buyer_user()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.buyers
     WHERE supabase_user_id = auth.uid()
       AND portal_access_enabled = TRUE
  );
EXCEPTION WHEN undefined_function THEN
  RETURN FALSE;
END
$$;

CREATE OR REPLACE FUNCTION public.current_buyer_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT id FROM public.buyers
     WHERE supabase_user_id = auth.uid()
       AND portal_access_enabled = TRUE
     LIMIT 1
  );
EXCEPTION WHEN undefined_function THEN
  RETURN NULL;
END
$$;


-- =============================================================================
-- 6) RLS — buyers see own; investors see own; staff see all
-- =============================================================================

ALTER TABLE "buyers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "buyers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buyers_internal_all ON "buyers";
CREATE POLICY buyers_internal_all ON "buyers"
  FOR ALL
  USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());
DROP POLICY IF EXISTS buyers_self_read ON "buyers";
CREATE POLICY buyers_self_read ON "buyers"
  FOR SELECT
  USING (
    public.is_internal_user() OR
    supabase_user_id = auth.uid()
  );

ALTER TABLE "buyer_unit_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "buyer_unit_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buyer_unit_assignments_internal_all ON "buyer_unit_assignments";
CREATE POLICY buyer_unit_assignments_internal_all ON "buyer_unit_assignments"
  FOR ALL
  USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());
DROP POLICY IF EXISTS buyer_unit_assignments_buyer_read ON "buyer_unit_assignments";
CREATE POLICY buyer_unit_assignments_buyer_read ON "buyer_unit_assignments"
  FOR SELECT
  USING (
    public.is_internal_user() OR
    buyer_id = public.current_buyer_id()
  );

ALTER TABLE "buyer_progress_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "buyer_progress_reports" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buyer_progress_reports_internal_all ON "buyer_progress_reports";
CREATE POLICY buyer_progress_reports_internal_all ON "buyer_progress_reports"
  FOR ALL
  USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());
DROP POLICY IF EXISTS buyer_progress_reports_buyer_read ON "buyer_progress_reports";
CREATE POLICY buyer_progress_reports_buyer_read ON "buyer_progress_reports"
  FOR SELECT
  USING (
    public.is_internal_user() OR
    (
      status = 'published' AND public.is_buyer_user() AND (
        unit_id IN (
          SELECT unit_id FROM buyer_unit_assignments
          WHERE buyer_id = public.current_buyer_id()
        ) OR
        (unit_id IS NULL AND project_id IN (
          SELECT DISTINCT v.project_id FROM villas v
          JOIN buyer_unit_assignments bua ON bua.unit_id = v.id
          WHERE bua.buyer_id = public.current_buyer_id()
        ))
      )
    )
  );

ALTER TABLE "investor_portal_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "investor_portal_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS investor_portal_requests_internal_all ON "investor_portal_requests";
CREATE POLICY investor_portal_requests_internal_all ON "investor_portal_requests"
  FOR ALL
  USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());
DROP POLICY IF EXISTS investor_portal_requests_self_read ON "investor_portal_requests";
CREATE POLICY investor_portal_requests_self_read ON "investor_portal_requests"
  FOR SELECT
  USING (
    public.is_internal_user() OR
    (public.is_investor_user() AND investor_id = public.current_investor_id())
  );
DROP POLICY IF EXISTS investor_portal_requests_self_insert ON "investor_portal_requests";
CREATE POLICY investor_portal_requests_self_insert ON "investor_portal_requests"
  FOR INSERT
  WITH CHECK (
    public.is_internal_user() OR
    (public.is_investor_user() AND investor_id = public.current_investor_id())
  );

COMMIT;
