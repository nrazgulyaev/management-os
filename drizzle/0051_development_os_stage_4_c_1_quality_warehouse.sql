-- =============================================================================
-- 0051 — Development OS · Stage 4.C.1 — QA/QC + Warehouse / Inventory
--
-- 8 new tables across two domains:
--   QA/QC: qa_qc_categories, qa_qc_issues, qa_qc_inspections, qa_qc_issue_photos
--   Inventory: dev_os_inventory_items, dev_os_inventory_locations,
--              dev_os_inventory_stock_balances, dev_os_inventory_movements
--
-- Schema-name reconciliation: Management OS already has `inventory_items`
-- etc. tables for villa operations consumables — Stage 4.C namespaces all
-- four new tables with `dev_os_` prefix to avoid collision (same pattern
-- as `dev_os_purchase_requests`).
--
-- Forward-FK reservations:
--   qa_qc_issues.work_package_id → work_packages(id) added in 0052
--   qa_qc_issues.related_change_order_id → change_orders(id) added in 0053
--   dev_os_inventory_movements.work_package_id → work_packages(id) in 0052
--
-- Schema-name reconciliation: spec uses `units(id)` — actual is `villas(id)`.
--
-- All RLS-protected, internal-only by default.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) qa_qc_categories — hierarchical defect categories
-- =============================================================================

CREATE TABLE IF NOT EXISTS "qa_qc_categories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_key" TEXT UNIQUE NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT,
  "parent_id" UUID REFERENCES "qa_qc_categories"("id"),
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "qa_qc_categories_active_idx"
  ON "qa_qc_categories"("is_active");
CREATE INDEX IF NOT EXISTS "qa_qc_categories_parent_idx"
  ON "qa_qc_categories"("parent_id");


-- =============================================================================
-- 2) qa_qc_issues — full lifecycle defect tracking
-- =============================================================================
-- spec: villa_id → villas(id) (the codebase's "units")
-- forward-ref: work_package_id, related_change_order_id (FKs added in 0052/0053)

CREATE TABLE IF NOT EXISTS "qa_qc_issues" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "issue_code" TEXT UNIQUE NOT NULL,
  "title" TEXT NOT NULL,

  "project_id" UUID NOT NULL REFERENCES "projects"("id"),
  "villa_id" UUID REFERENCES "villas"("id"),
  "zone_reference" TEXT,
  "work_package_id" UUID,                          -- forward-ref to 0052

  "category_id" UUID NOT NULL REFERENCES "qa_qc_categories"("id"),
  "severity" TEXT NOT NULL CHECK ("severity" IN (
    'low', 'medium', 'high', 'critical'
  )),

  "description" TEXT NOT NULL,

  "responsible_vendor_id" UUID REFERENCES "vendors"("id"),
  "reported_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "assigned_to" UUID REFERENCES "app_users"("id"),

  "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN (
    'open',
    'assigned',
    'in_progress',
    'ready_for_reinspection',
    'rejected',
    'accepted',
    'closed'
  )),
  "status_changed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  "reported_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deadline_at" DATE,
  "resolved_at" TIMESTAMPTZ,
  "closed_at" TIMESTAMPTZ,

  "related_site_report_id" UUID REFERENCES "site_reports"("id"),
  "related_change_order_id" UUID,                  -- forward-ref to 0053

  "estimated_rework_cost_minor" BIGINT,
  "actual_rework_cost_minor" BIGINT,
  "currency" TEXT DEFAULT 'IDR',

  "notes" TEXT,
  "internal_notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "qa_qc_issues_project_idx" ON "qa_qc_issues"("project_id");
CREATE INDEX IF NOT EXISTS "qa_qc_issues_villa_idx" ON "qa_qc_issues"("villa_id");
CREATE INDEX IF NOT EXISTS "qa_qc_issues_status_idx" ON "qa_qc_issues"("status");
CREATE INDEX IF NOT EXISTS "qa_qc_issues_severity_idx" ON "qa_qc_issues"("severity");
CREATE INDEX IF NOT EXISTS "qa_qc_issues_assigned_idx" ON "qa_qc_issues"("assigned_to");
CREATE INDEX IF NOT EXISTS "qa_qc_issues_deadline_idx"
  ON "qa_qc_issues"("deadline_at")
  WHERE "status" NOT IN ('accepted', 'closed');

CREATE OR REPLACE FUNCTION "qa_qc_issues_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_qa_qc_issues_updated_at" ON "qa_qc_issues";
CREATE TRIGGER "trg_qa_qc_issues_updated_at"
  BEFORE UPDATE ON "qa_qc_issues"
  FOR EACH ROW EXECUTE FUNCTION "qa_qc_issues_set_updated_at"();


-- =============================================================================
-- 3) qa_qc_inspections — rework rounds per issue
-- =============================================================================

CREATE TABLE IF NOT EXISTS "qa_qc_inspections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "issue_id" UUID NOT NULL REFERENCES "qa_qc_issues"("id") ON DELETE CASCADE,

  "inspection_number" INTEGER NOT NULL,
  "inspector_id" UUID NOT NULL REFERENCES "app_users"("id"),
  "inspection_date" DATE NOT NULL DEFAULT CURRENT_DATE,

  "result" TEXT NOT NULL CHECK ("result" IN (
    'passed', 'failed', 'partial_pass'
  )),
  "result_notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("issue_id", "inspection_number")
);

CREATE INDEX IF NOT EXISTS "qa_qc_inspections_issue_idx"
  ON "qa_qc_inspections"("issue_id");
CREATE INDEX IF NOT EXISTS "qa_qc_inspections_date_idx"
  ON "qa_qc_inspections"("inspection_date" DESC);


-- =============================================================================
-- 4) qa_qc_issue_photos — initial defect + resolution proof
-- =============================================================================

CREATE TABLE IF NOT EXISTS "qa_qc_issue_photos" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "issue_id" UUID NOT NULL REFERENCES "qa_qc_issues"("id") ON DELETE CASCADE,
  "document_id" UUID NOT NULL REFERENCES "documents"("id"),

  "photo_role" TEXT NOT NULL CHECK ("photo_role" IN (
    'initial_defect', 'work_in_progress', 'resolution_proof', 'reinspection'
  )),
  "inspection_id" UUID REFERENCES "qa_qc_inspections"("id"),
  "caption" TEXT,

  "uploaded_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "qa_qc_issue_photos_issue_idx"
  ON "qa_qc_issue_photos"("issue_id");
CREATE INDEX IF NOT EXISTS "qa_qc_issue_photos_role_idx"
  ON "qa_qc_issue_photos"("photo_role");


-- =============================================================================
-- 5) inventory_items — SKU catalog
-- =============================================================================

CREATE TABLE IF NOT EXISTS "dev_os_inventory_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "sku" TEXT UNIQUE NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT,

  "category" TEXT NOT NULL,
  "unit_of_measure" TEXT NOT NULL,

  "average_cost_minor" BIGINT,
  "last_purchase_price_minor" BIGINT,
  "last_purchase_date" DATE,
  "default_currency" TEXT DEFAULT 'IDR',

  "minimum_stock_level" NUMERIC(12,4),
  "reorder_point" NUMERIC(12,4),

  "preferred_vendor_id" UUID REFERENCES "vendors"("id"),

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dev_os_inventory_items_active_idx" ON "dev_os_inventory_items"("is_active");
CREATE INDEX IF NOT EXISTS "dev_os_inventory_items_category_idx" ON "dev_os_inventory_items"("category");
CREATE INDEX IF NOT EXISTS "dev_os_inventory_items_vendor_idx"
  ON "dev_os_inventory_items"("preferred_vendor_id");

CREATE OR REPLACE FUNCTION "dev_os_inventory_items_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_dev_os_inventory_items_updated_at" ON "dev_os_inventory_items";
CREATE TRIGGER "trg_dev_os_inventory_items_updated_at"
  BEFORE UPDATE ON "dev_os_inventory_items"
  FOR EACH ROW EXECUTE FUNCTION "dev_os_inventory_items_set_updated_at"();


-- =============================================================================
-- 6) inventory_locations
-- =============================================================================

CREATE TABLE IF NOT EXISTS "dev_os_inventory_locations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "location_code" TEXT UNIQUE NOT NULL,
  "display_name" TEXT NOT NULL,

  "location_type" TEXT NOT NULL CHECK ("location_type" IN (
    'warehouse', 'site', 'in_transit', 'consumed', 'damaged', 'returned'
  )),

  "project_id" UUID REFERENCES "projects"("id"),

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dev_os_inventory_locations_type_idx"
  ON "dev_os_inventory_locations"("location_type");
CREATE INDEX IF NOT EXISTS "dev_os_inventory_locations_project_idx"
  ON "dev_os_inventory_locations"("project_id");


-- =============================================================================
-- 7) inventory_stock_balances — current stock per item per location
-- =============================================================================
-- quantity_available is GENERATED ALWAYS AS (on_hand - reserved) STORED.

CREATE TABLE IF NOT EXISTS "dev_os_inventory_stock_balances" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "item_id" UUID NOT NULL REFERENCES "dev_os_inventory_items"("id"),
  "location_id" UUID NOT NULL REFERENCES "dev_os_inventory_locations"("id"),

  "quantity_on_hand" NUMERIC(14,4) NOT NULL DEFAULT 0
    CHECK ("quantity_on_hand" >= 0),
  "quantity_reserved" NUMERIC(14,4) NOT NULL DEFAULT 0
    CHECK ("quantity_reserved" >= 0),
  "quantity_available" NUMERIC(14,4) GENERATED ALWAYS AS (
    "quantity_on_hand" - "quantity_reserved"
  ) STORED,

  "last_movement_at" TIMESTAMPTZ,

  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("item_id", "location_id")
);

CREATE INDEX IF NOT EXISTS "dev_os_inventory_stock_balances_item_idx"
  ON "dev_os_inventory_stock_balances"("item_id");
CREATE INDEX IF NOT EXISTS "dev_os_inventory_stock_balances_location_idx"
  ON "dev_os_inventory_stock_balances"("location_id");
CREATE INDEX IF NOT EXISTS "dev_os_inventory_stock_balances_low_stock_idx"
  ON "dev_os_inventory_stock_balances"("item_id")
  WHERE "quantity_on_hand" <= 0;

CREATE OR REPLACE FUNCTION "dev_os_inventory_stock_balances_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_dev_os_inventory_stock_balances_updated_at"
  ON "dev_os_inventory_stock_balances";
CREATE TRIGGER "trg_dev_os_inventory_stock_balances_updated_at"
  BEFORE UPDATE ON "dev_os_inventory_stock_balances"
  FOR EACH ROW EXECUTE FUNCTION "dev_os_inventory_stock_balances_set_updated_at"();


-- =============================================================================
-- 8) inventory_movements — append-only stock movement log
-- =============================================================================

CREATE TABLE IF NOT EXISTS "dev_os_inventory_movements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "movement_code" TEXT UNIQUE NOT NULL,

  "item_id" UUID NOT NULL REFERENCES "dev_os_inventory_items"("id"),
  "quantity" NUMERIC(14,4) NOT NULL CHECK ("quantity" > 0),

  "movement_type" TEXT NOT NULL CHECK ("movement_type" IN (
    'received',
    'reserved',
    'unreserved',
    'issued_to_site',
    'used',
    'returned',
    'damaged',
    'lost',
    'transferred',
    'written_off',
    'adjusted'
  )),

  "from_location_id" UUID REFERENCES "dev_os_inventory_locations"("id"),
  "to_location_id" UUID REFERENCES "dev_os_inventory_locations"("id"),

  "project_id" UUID REFERENCES "projects"("id"),
  "villa_id" UUID REFERENCES "villas"("id"),
  "work_package_id" UUID,                          -- forward-ref to 0052

  "related_po_id" UUID REFERENCES "material_purchase_orders"("id"),
  "related_delivery_id" UUID REFERENCES "material_deliveries"("id"),
  "related_site_report_id" UUID REFERENCES "site_reports"("id"),
  "related_qa_qc_issue_id" UUID REFERENCES "qa_qc_issues"("id"),

  "responsible_user_id" UUID NOT NULL REFERENCES "app_users"("id"),
  "movement_date" DATE NOT NULL DEFAULT CURRENT_DATE,

  "reason" TEXT,
  "notes" TEXT,
  "proof_document_id" UUID REFERENCES "documents"("id"),

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dev_os_inventory_movements_item_idx" ON "dev_os_inventory_movements"("item_id");
CREATE INDEX IF NOT EXISTS "dev_os_inventory_movements_type_idx" ON "dev_os_inventory_movements"("movement_type");
CREATE INDEX IF NOT EXISTS "dev_os_inventory_movements_date_idx"
  ON "dev_os_inventory_movements"("movement_date" DESC);
CREATE INDEX IF NOT EXISTS "dev_os_inventory_movements_project_idx"
  ON "dev_os_inventory_movements"("project_id");
CREATE INDEX IF NOT EXISTS "dev_os_inventory_movements_villa_idx"
  ON "dev_os_inventory_movements"("villa_id");


-- =============================================================================
-- 9) RLS — internal-only on all 8 new tables
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'qa_qc_categories', 'qa_qc_issues', 'qa_qc_inspections',
      'qa_qc_issue_photos',
      'dev_os_inventory_items', 'dev_os_inventory_locations',
      'dev_os_inventory_stock_balances', 'dev_os_inventory_movements'
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

-- =============================================================================
-- 10) Seed default QA/QC categories (idempotent)
-- =============================================================================

INSERT INTO "qa_qc_categories" (category_key, display_name, description, display_order) VALUES
  ('structural',          'Structural',           'Foundation, walls, beams, columns', 10),
  ('mep_electrical',      'MEP — Electrical',     'Wiring, outlets, switches, panels', 20),
  ('mep_plumbing',        'MEP — Plumbing',       'Pipes, fittings, water pressure', 30),
  ('mep_hvac',            'MEP — HVAC',           'Air conditioning, ventilation', 40),
  ('finishing_paint',     'Finishing — Paint',    'Paint coverage, texture, color match', 50),
  ('finishing_microcement', 'Finishing — Microcement', 'Microcement application defects', 55),
  ('finishing_tile',      'Finishing — Tile',     'Tile alignment, grouting, chipping', 60),
  ('finishing_woodwork',  'Finishing — Woodwork', 'Doors, frames, trim, joinery', 70),
  ('pool_water',          'Pool — Water systems', 'Pool plumbing, heating, lighting', 80),
  ('landscaping',         'Landscaping',          'Plants, irrigation, hardscape', 90),
  ('other',               'Other',                'Uncategorized issues', 999)
ON CONFLICT (category_key) DO NOTHING;

COMMIT;
