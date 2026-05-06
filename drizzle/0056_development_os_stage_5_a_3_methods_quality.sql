-- =============================================================================
-- 0056 — Development OS · Stage 5.A.3 — Method Statements + Quality Standards
--
-- 2 new tables + 1 column on existing qa_qc_inspections:
--   - method_statements        SOPs with JSONB procedure_steps
--   - quality_standards        acceptance criteria templates
--   - qa_qc_inspections.quality_standard_id FK
--
-- All RLS-protected, internal-only.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) method_statements
-- =============================================================================

CREATE TABLE IF NOT EXISTS "method_statements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "method_code" TEXT UNIQUE NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,

  "category" TEXT NOT NULL CHECK ("category" IN (
    'structural', 'mep_electrical', 'mep_plumbing', 'mep_hvac',
    'finishing', 'safety', 'demolition', 'site_preparation',
    'inspection', 'handover', 'general'
  )),

  "applicable_work_types" TEXT[],
  "applicable_specifications" UUID[] NOT NULL DEFAULT '{}',

  "procedure_steps" JSONB NOT NULL,
  "required_tools" TEXT[],
  "required_materials" TEXT[],
  "required_ppe" TEXT[],

  "quality_checkpoints" JSONB,

  "safety_hazards" TEXT[],
  "hazard_mitigations" TEXT[],

  "reference_documents" UUID[] NOT NULL DEFAULT '{}',
  "reference_video_urls" TEXT[],

  "version_number" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN (
    'draft', 'under_review', 'approved', 'active', 'superseded', 'archived'
  )),
  "effective_from" DATE,
  "effective_until" DATE,
  "superseded_by" UUID REFERENCES "method_statements"("id"),

  "approved_by" UUID REFERENCES "app_users"("id"),
  "approved_at" TIMESTAMPTZ,

  "notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "method_statements_category_idx"
  ON "method_statements"("category");
CREATE INDEX IF NOT EXISTS "method_statements_status_idx"
  ON "method_statements"("status");

CREATE OR REPLACE FUNCTION "method_statements_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_method_statements_updated_at" ON "method_statements";
CREATE TRIGGER "trg_method_statements_updated_at"
  BEFORE UPDATE ON "method_statements"
  FOR EACH ROW EXECUTE FUNCTION "method_statements_set_updated_at"();


-- =============================================================================
-- 2) quality_standards
-- =============================================================================

CREATE TABLE IF NOT EXISTS "quality_standards" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "standard_code" TEXT UNIQUE NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,

  "category" TEXT NOT NULL,

  "acceptance_criteria" TEXT NOT NULL,
  "measurement_method" TEXT,

  "tolerance_specification" JSONB,

  "reference_photos_acceptable" UUID[] NOT NULL DEFAULT '{}',
  "reference_photos_unacceptable" UUID[] NOT NULL DEFAULT '{}',
  "reference_documents" UUID[] NOT NULL DEFAULT '{}',

  "industry_standards_reference" TEXT[],

  "applicable_specifications" UUID[] NOT NULL DEFAULT '{}',
  "applicable_method_statements" UUID[] NOT NULL DEFAULT '{}',

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,

  "notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "quality_standards_category_idx"
  ON "quality_standards"("category");
CREATE INDEX IF NOT EXISTS "quality_standards_active_idx"
  ON "quality_standards"("is_active");

CREATE OR REPLACE FUNCTION "quality_standards_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_quality_standards_updated_at" ON "quality_standards";
CREATE TRIGGER "trg_quality_standards_updated_at"
  BEFORE UPDATE ON "quality_standards"
  FOR EACH ROW EXECUTE FUNCTION "quality_standards_set_updated_at"();


-- =============================================================================
-- 3) Extend qa_qc_inspections — link to quality_standards
-- =============================================================================

ALTER TABLE "qa_qc_inspections"
  ADD COLUMN IF NOT EXISTS "quality_standard_id" UUID
    REFERENCES "quality_standards"("id");

CREATE INDEX IF NOT EXISTS "qa_qc_inspections_standard_idx"
  ON "qa_qc_inspections"("quality_standard_id");


-- =============================================================================
-- 4) RLS
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'method_statements', 'quality_standards'
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
