-- =============================================================================
-- 0053 — Development OS · Stage 4.C.3 — Project Memory + Variations
--
-- 3 new tables — the project's institutional memory layer:
--   - project_decisions      Decision Log with audit trail (supersede flow)
--   - project_risks          Risk Register with risk_score GENERATED column
--   - change_orders          Variations / scope changes with HITL approval
--
-- Adds forward-FK constraints to existing tables that previously held
-- nullable related_change_order_id columns:
--   qa_qc_issues.related_change_order_id, project_decisions.related_change_order_id
--
-- All RLS-protected, internal-only by default.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) project_decisions — Decision Log
-- =============================================================================

CREATE TABLE IF NOT EXISTS "project_decisions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "decision_code" TEXT UNIQUE NOT NULL,
  "title" TEXT NOT NULL,

  "project_id" UUID NOT NULL REFERENCES "projects"("id"),
  "villa_id" UUID REFERENCES "villas"("id"),
  "work_package_id" UUID REFERENCES "work_packages"("id"),

  "decision_text" TEXT NOT NULL,
  "rationale" TEXT,
  "context" TEXT,

  "decided_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "approved_by" UUID REFERENCES "app_users"("id"),
  "decision_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "approval_date" DATE,

  "related_supplier_id" UUID REFERENCES "vendors"("id"),
  "related_change_order_id" UUID,                    -- forward-ref FK added below
  "related_documents" UUID[] NOT NULL DEFAULT '{}',
  "related_photos" UUID[] NOT NULL DEFAULT '{}',

  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN (
    'draft', 'active', 'superseded', 'reversed'
  )),
  "superseded_by" UUID REFERENCES "project_decisions"("id"),

  "category" TEXT,
  "tags" TEXT[],

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "project_decisions_project_idx"
  ON "project_decisions"("project_id");
CREATE INDEX IF NOT EXISTS "project_decisions_status_idx"
  ON "project_decisions"("status");
CREATE INDEX IF NOT EXISTS "project_decisions_date_idx"
  ON "project_decisions"("decision_date" DESC);
CREATE INDEX IF NOT EXISTS "project_decisions_category_idx"
  ON "project_decisions"("category");

CREATE OR REPLACE FUNCTION "project_decisions_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_project_decisions_updated_at" ON "project_decisions";
CREATE TRIGGER "trg_project_decisions_updated_at"
  BEFORE UPDATE ON "project_decisions"
  FOR EACH ROW EXECUTE FUNCTION "project_decisions_set_updated_at"();


-- =============================================================================
-- 2) project_risks — Risk Register with risk_score GENERATED
-- =============================================================================

CREATE TABLE IF NOT EXISTS "project_risks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "risk_code" TEXT UNIQUE NOT NULL,
  "title" TEXT NOT NULL,

  "project_id" UUID NOT NULL REFERENCES "projects"("id"),

  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL CHECK ("category" IN (
    'land_legal', 'permit_delay', 'weather', 'supplier_delay',
    'fx_currency', 'buyer_payment_delay', 'cost_overrun',
    'quality_issue', 'labor_shortage', 'investor_funding_delay',
    'tax_uncertainty', 'design_change', 'safety', 'other'
  )),

  "probability" TEXT NOT NULL CHECK ("probability" IN (
    'very_low', 'low', 'medium', 'high', 'very_high'
  )),
  "impact" TEXT NOT NULL CHECK ("impact" IN (
    'minor', 'moderate', 'major', 'severe', 'catastrophic'
  )),
  "risk_score" INTEGER GENERATED ALWAYS AS (
    CASE "probability"
      WHEN 'very_low' THEN 1
      WHEN 'low' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'high' THEN 4
      WHEN 'very_high' THEN 5
    END *
    CASE "impact"
      WHEN 'minor' THEN 1
      WHEN 'moderate' THEN 2
      WHEN 'major' THEN 3
      WHEN 'severe' THEN 4
      WHEN 'catastrophic' THEN 5
    END
  ) STORED,

  "owner_id" UUID REFERENCES "app_users"("id"),
  "mitigation_plan" TEXT,
  "mitigation_status" TEXT NOT NULL DEFAULT 'identified' CHECK ("mitigation_status" IN (
    'identified', 'planning_mitigation', 'mitigating', 'monitored',
    'closed_resolved', 'closed_realized'
  )),
  "mitigation_deadline" DATE,

  "estimated_cost_impact_minor" BIGINT,
  "estimated_schedule_impact_days" INTEGER,

  "related_tasks" UUID[] NOT NULL DEFAULT '{}',
  "related_decisions" UUID[] NOT NULL DEFAULT '{}',
  "related_change_orders" UUID[] NOT NULL DEFAULT '{}',

  "identified_at" DATE NOT NULL DEFAULT CURRENT_DATE,
  "closed_at" DATE,
  "closed_reason" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "project_risks_project_idx" ON "project_risks"("project_id");
CREATE INDEX IF NOT EXISTS "project_risks_status_idx" ON "project_risks"("mitigation_status");
CREATE INDEX IF NOT EXISTS "project_risks_score_idx" ON "project_risks"("risk_score" DESC);
CREATE INDEX IF NOT EXISTS "project_risks_category_idx" ON "project_risks"("category");

CREATE OR REPLACE FUNCTION "project_risks_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_project_risks_updated_at" ON "project_risks";
CREATE TRIGGER "trg_project_risks_updated_at"
  BEFORE UPDATE ON "project_risks"
  FOR EACH ROW EXECUTE FUNCTION "project_risks_set_updated_at"();


-- =============================================================================
-- 3) change_orders — Variations / scope changes
-- =============================================================================

CREATE TABLE IF NOT EXISTS "change_orders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "change_order_code" TEXT UNIQUE NOT NULL,
  "title" TEXT NOT NULL,

  "project_id" UUID NOT NULL REFERENCES "projects"("id"),
  "villa_id" UUID REFERENCES "villas"("id"),
  "work_package_id" UUID REFERENCES "work_packages"("id"),

  "initiated_by_type" TEXT NOT NULL CHECK ("initiated_by_type" IN (
    'arconique_internal', 'buyer_request', 'investor_request',
    'vendor_proposed', 'regulatory', 'design_correction', 'site_condition'
  )),
  "initiated_by_user_id" UUID REFERENCES "app_users"("id"),
  "initiated_by_buyer_id" UUID,

  "requested_at" DATE NOT NULL DEFAULT CURRENT_DATE,

  "reason" TEXT NOT NULL,
  "scope_change_description" TEXT NOT NULL,

  "cost_impact_minor" BIGINT NOT NULL DEFAULT 0,    -- can be negative
  "cost_impact_currency" TEXT DEFAULT 'IDR',
  "schedule_impact_days" INTEGER NOT NULL DEFAULT 0,-- can be negative

  "status" TEXT NOT NULL DEFAULT 'requested' CHECK ("status" IN (
    'requested', 'under_review', 'approved', 'in_progress',
    'completed', 'rejected', 'cancelled'
  )),
  "status_changed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  "required_approval_role" TEXT,
  "approved_by" UUID REFERENCES "app_users"("id"),
  "approved_at" TIMESTAMPTZ,
  "approval_notes" TEXT,
  "rejection_reason" TEXT,

  "implementation_start" DATE,
  "implementation_finish" DATE,

  "related_drawings" UUID[] NOT NULL DEFAULT '{}',
  "related_invoices" UUID[] NOT NULL DEFAULT '{}',
  "related_decisions" UUID[] NOT NULL DEFAULT '{}',
  "related_qa_qc_issues" UUID[] NOT NULL DEFAULT '{}',

  "notes" TEXT,
  "internal_notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "change_orders_project_idx" ON "change_orders"("project_id");
CREATE INDEX IF NOT EXISTS "change_orders_villa_idx" ON "change_orders"("villa_id");
CREATE INDEX IF NOT EXISTS "change_orders_status_idx" ON "change_orders"("status");
CREATE INDEX IF NOT EXISTS "change_orders_initiated_idx" ON "change_orders"("initiated_by_type");

CREATE OR REPLACE FUNCTION "change_orders_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_change_orders_updated_at" ON "change_orders";
CREATE TRIGGER "trg_change_orders_updated_at"
  BEFORE UPDATE ON "change_orders"
  FOR EACH ROW EXECUTE FUNCTION "change_orders_set_updated_at"();


-- =============================================================================
-- 4) Forward-FK constraints
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qa_qc_issues_change_order_fk'
  ) THEN
    ALTER TABLE "qa_qc_issues"
      ADD CONSTRAINT "qa_qc_issues_change_order_fk"
      FOREIGN KEY ("related_change_order_id") REFERENCES "change_orders"("id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_decisions_change_order_fk'
  ) THEN
    ALTER TABLE "project_decisions"
      ADD CONSTRAINT "project_decisions_change_order_fk"
      FOREIGN KEY ("related_change_order_id") REFERENCES "change_orders"("id");
  END IF;
END $$;


-- =============================================================================
-- 5) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'project_decisions', 'project_risks', 'change_orders'
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

COMMIT;
