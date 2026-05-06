-- =============================================================================
-- 0055 — Development OS · Stage 5.A.2 — BOQ + Specifications
--
-- 4 new tables:
--   - boq_documents       BOQ per (project, villa, version)
--   - boq_sections        hierarchical sections (parent_section_id self-FK)
--   - boq_items           line items with computed total_minor (GENERATED)
--   - specifications      material/finish library
--
-- boq_items.specification_id FK to specifications added at end of migration
-- (forward reference within same file).
--
-- All RLS-protected, internal-only.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) boq_documents
-- =============================================================================

CREATE TABLE IF NOT EXISTS "boq_documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "boq_code" TEXT UNIQUE NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,

  "project_id" UUID NOT NULL REFERENCES "projects"("id"),
  "villa_id" UUID REFERENCES "villas"("id"),

  "version_label" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL DEFAULT 1,

  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN (
    'draft', 'under_review', 'approved', 'tender', 'awarded', 'superseded', 'archived'
  )),

  "total_amount_minor" BIGINT,
  "currency" TEXT NOT NULL DEFAULT 'IDR',

  "approved_by" UUID REFERENCES "app_users"("id"),
  "approved_at" TIMESTAMPTZ,

  "prepared_by" UUID REFERENCES "app_users"("id"),
  "qs_firm" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "boq_documents_project_idx" ON "boq_documents"("project_id");
CREATE INDEX IF NOT EXISTS "boq_documents_villa_idx" ON "boq_documents"("villa_id");
CREATE INDEX IF NOT EXISTS "boq_documents_status_idx" ON "boq_documents"("status");

CREATE OR REPLACE FUNCTION "boq_documents_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_boq_documents_updated_at" ON "boq_documents";
CREATE TRIGGER "trg_boq_documents_updated_at"
  BEFORE UPDATE ON "boq_documents"
  FOR EACH ROW EXECUTE FUNCTION "boq_documents_set_updated_at"();


-- =============================================================================
-- 2) boq_sections — hierarchical
-- =============================================================================

CREATE TABLE IF NOT EXISTS "boq_sections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "boq_document_id" UUID NOT NULL
    REFERENCES "boq_documents"("id") ON DELETE CASCADE,
  "parent_section_id" UUID REFERENCES "boq_sections"("id"),

  "section_code" TEXT NOT NULL,
  "section_name" TEXT NOT NULL,
  "description" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0,

  "subtotal_minor" BIGINT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("boq_document_id", "section_code")
);

CREATE INDEX IF NOT EXISTS "boq_sections_document_idx"
  ON "boq_sections"("boq_document_id");
CREATE INDEX IF NOT EXISTS "boq_sections_parent_idx"
  ON "boq_sections"("parent_section_id");

CREATE OR REPLACE FUNCTION "boq_sections_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_boq_sections_updated_at" ON "boq_sections";
CREATE TRIGGER "trg_boq_sections_updated_at"
  BEFORE UPDATE ON "boq_sections"
  FOR EACH ROW EXECUTE FUNCTION "boq_sections_set_updated_at"();


-- =============================================================================
-- 3) boq_items — line items with GENERATED total_minor
-- =============================================================================

CREATE TABLE IF NOT EXISTS "boq_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "section_id" UUID NOT NULL
    REFERENCES "boq_sections"("id") ON DELETE CASCADE,

  "item_code" TEXT NOT NULL,
  "description" TEXT NOT NULL,

  "quantity" NUMERIC(14,4) NOT NULL,
  "unit_of_measure" TEXT NOT NULL,

  "unit_rate_minor" BIGINT NOT NULL,
  "rate_currency" TEXT NOT NULL DEFAULT 'IDR',
  "total_minor" BIGINT GENERATED ALWAYS AS (
    ("quantity" * "unit_rate_minor")::BIGINT
  ) STORED,

  "cost_category_id" UUID REFERENCES "dev_cost_categories"("id"),
  "specification_id" UUID,                         -- FK added at end of migration
  "inventory_item_id" UUID REFERENCES "dev_os_inventory_items"("id"),

  "waste_factor" NUMERIC(5,4) DEFAULT 0,
  "logistics_factor" NUMERIC(5,4) DEFAULT 0,
  "labor_factor" NUMERIC(5,4) DEFAULT 0,

  "display_order" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("section_id", "item_code")
);

CREATE INDEX IF NOT EXISTS "boq_items_section_idx" ON "boq_items"("section_id");
CREATE INDEX IF NOT EXISTS "boq_items_category_idx" ON "boq_items"("cost_category_id");
CREATE INDEX IF NOT EXISTS "boq_items_inventory_idx" ON "boq_items"("inventory_item_id");

CREATE OR REPLACE FUNCTION "boq_items_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_boq_items_updated_at" ON "boq_items";
CREATE TRIGGER "trg_boq_items_updated_at"
  BEFORE UPDATE ON "boq_items"
  FOR EACH ROW EXECUTE FUNCTION "boq_items_set_updated_at"();


-- =============================================================================
-- 4) specifications
-- =============================================================================

CREATE TABLE IF NOT EXISTS "specifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "spec_code" TEXT UNIQUE NOT NULL,
  "spec_name" TEXT NOT NULL,
  "description" TEXT NOT NULL,

  "spec_category" TEXT NOT NULL CHECK ("spec_category" IN (
    'wall_finish', 'floor_finish', 'ceiling_finish', 'paint',
    'tile', 'stone', 'wood', 'metal', 'glass',
    'plumbing_fixture', 'electrical_fixture', 'lighting',
    'door_window', 'hardware', 'appliance', 'furniture',
    'landscape', 'pool', 'mep', 'structural', 'other'
  )),

  "brand" TEXT,
  "model_number" TEXT,
  "color_code" TEXT,
  "dimensions" TEXT,
  "finish_type" TEXT,

  "applicable_standards" TEXT[],
  "tolerance_specifications" TEXT,

  "reference_documents" UUID[] NOT NULL DEFAULT '{}',

  "preferred_vendor_id" UUID REFERENCES "vendors"("id"),
  "alternative_vendor_ids" UUID[] NOT NULL DEFAULT '{}',

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "superseded_by" UUID REFERENCES "specifications"("id"),

  "notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "specifications_category_idx" ON "specifications"("spec_category");
CREATE INDEX IF NOT EXISTS "specifications_active_idx" ON "specifications"("is_active");

CREATE OR REPLACE FUNCTION "specifications_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_specifications_updated_at" ON "specifications";
CREATE TRIGGER "trg_specifications_updated_at"
  BEFORE UPDATE ON "specifications"
  FOR EACH ROW EXECUTE FUNCTION "specifications_set_updated_at"();


-- =============================================================================
-- 5) Forward FK: boq_items.specification_id → specifications.id
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boq_items_specification_fk'
  ) THEN
    ALTER TABLE "boq_items"
      ADD CONSTRAINT "boq_items_specification_fk"
      FOREIGN KEY ("specification_id") REFERENCES "specifications"("id");
  END IF;
END $$;


-- =============================================================================
-- 6) RLS
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'boq_documents', 'boq_sections', 'boq_items', 'specifications'
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
