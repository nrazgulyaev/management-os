-- =============================================================================
-- 0054 — Development OS · Stage 5.A.1 — Drawings + Document Control
--
-- 3 new tables:
--   - drawings                    drawing metadata
--   - drawing_revisions           one row per Rev A/B/…
--   - drawing_distribution_log    "we sent Rev B to vendor X via WhatsApp"
--
-- Defense in depth: partial unique index drawing_revisions_active_ifc
-- guarantees at most one issued_for_construction revision per drawing.
--
-- Schema-name reconciliation: spec uses villas(id) (not units) — same as
-- prior stages.
--
-- All RLS-protected, internal-only.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) drawings — drawing metadata
-- =============================================================================

CREATE TABLE IF NOT EXISTS "drawings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "drawing_code" TEXT UNIQUE NOT NULL,
  "drawing_number" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,

  "project_id" UUID NOT NULL REFERENCES "projects"("id"),
  "villa_id" UUID REFERENCES "villas"("id"),

  "drawing_type" TEXT NOT NULL CHECK ("drawing_type" IN (
    'architectural', 'structural', 'mep_electrical', 'mep_plumbing',
    'mep_hvac', 'landscape', 'pool', 'site_plan', 'detail',
    'shop_drawing', 'as_built', 'sketch', 'other'
  )),
  "drawing_phase" TEXT CHECK ("drawing_phase" IN (
    'concept', 'schematic_design', 'design_development',
    'permit_set', 'construction_set', 'as_built'
  )),

  "author_firm" TEXT,
  "author_name" TEXT,

  "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,

  "related_work_packages" UUID[] NOT NULL DEFAULT '{}',

  "notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "drawings_project_idx" ON "drawings"("project_id");
CREATE INDEX IF NOT EXISTS "drawings_villa_idx" ON "drawings"("villa_id");
CREATE INDEX IF NOT EXISTS "drawings_type_idx" ON "drawings"("drawing_type");
CREATE INDEX IF NOT EXISTS "drawings_phase_idx" ON "drawings"("drawing_phase");
CREATE INDEX IF NOT EXISTS "drawings_archived_idx" ON "drawings"("is_archived");

CREATE OR REPLACE FUNCTION "drawings_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_drawings_updated_at" ON "drawings";
CREATE TRIGGER "trg_drawings_updated_at"
  BEFORE UPDATE ON "drawings"
  FOR EACH ROW EXECUTE FUNCTION "drawings_set_updated_at"();


-- =============================================================================
-- 2) drawing_revisions — Rev A, B, …
-- =============================================================================

CREATE TABLE IF NOT EXISTS "drawing_revisions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "drawing_id" UUID NOT NULL REFERENCES "drawings"("id") ON DELETE CASCADE,

  "revision_label" TEXT NOT NULL,
  "revision_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "revision_reason" TEXT,

  "document_id" UUID NOT NULL REFERENCES "documents"("id"),

  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN (
    'draft',
    'for_review',
    'approved',
    'issued_for_construction',
    'superseded',
    'rejected'
  )),

  "approved_by" UUID REFERENCES "app_users"("id"),
  "approved_at" TIMESTAMPTZ,
  "approval_notes" TEXT,

  "issued_for_construction_at" TIMESTAMPTZ,
  "issued_by" UUID REFERENCES "app_users"("id"),

  "superseded_at" TIMESTAMPTZ,
  "superseded_by_revision_id" UUID REFERENCES "drawing_revisions"("id"),

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("drawing_id", "revision_label")
);

CREATE INDEX IF NOT EXISTS "drawing_revisions_drawing_idx"
  ON "drawing_revisions"("drawing_id");
CREATE INDEX IF NOT EXISTS "drawing_revisions_status_idx"
  ON "drawing_revisions"("status");

-- Partial unique index: at most one issued_for_construction per drawing.
CREATE UNIQUE INDEX IF NOT EXISTS "drawing_revisions_active_ifc"
  ON "drawing_revisions"("drawing_id")
  WHERE "status" = 'issued_for_construction';

CREATE OR REPLACE FUNCTION "drawing_revisions_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_drawing_revisions_updated_at" ON "drawing_revisions";
CREATE TRIGGER "trg_drawing_revisions_updated_at"
  BEFORE UPDATE ON "drawing_revisions"
  FOR EACH ROW EXECUTE FUNCTION "drawing_revisions_set_updated_at"();


-- =============================================================================
-- 3) drawing_distribution_log — vendor receipt tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS "drawing_distribution_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "revision_id" UUID NOT NULL
    REFERENCES "drawing_revisions"("id") ON DELETE CASCADE,
  "vendor_id" UUID NOT NULL REFERENCES "vendors"("id"),

  "distributed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "distributed_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "distribution_method" TEXT NOT NULL CHECK ("distribution_method" IN (
    'whatsapp', 'email', 'physical_print', 'platform_download', 'other'
  )),

  "acknowledged_at" TIMESTAMPTZ,
  "acknowledged_by_name" TEXT,
  "acknowledgment_method" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("revision_id", "vendor_id")
);

CREATE INDEX IF NOT EXISTS "drawing_distribution_log_revision_idx"
  ON "drawing_distribution_log"("revision_id");
CREATE INDEX IF NOT EXISTS "drawing_distribution_log_vendor_idx"
  ON "drawing_distribution_log"("vendor_id");


-- =============================================================================
-- 4) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'drawings', 'drawing_revisions', 'drawing_distribution_log'
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
