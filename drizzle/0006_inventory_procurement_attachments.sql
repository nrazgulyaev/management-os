-- Arconique Management OS — Migration 0006
-- Inventory, procurement, materials control + Supabase Storage attachments.
-- Idempotent on re-run.

BEGIN;

-- =============================================================================
-- 1) Suppliers
-- =============================================================================
CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "supplier_type" text NOT NULL DEFAULT 'general'
    CHECK ("supplier_type" IN (
      'general','linens','toiletries','maintenance','electrical','plumbing',
      'furniture','construction','chemicals','food_beverage','service'
    )),
  "contact_name" text,
  "email" text,
  "phone" text,
  "whatsapp" text,
  "website" text,
  "address" text,
  "country" text,
  "currency" text,
  "payment_terms" text,
  "tax_id" text,
  "notes" text,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','inactive','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "suppliers_status_idx" ON "suppliers" ("status");
CREATE INDEX IF NOT EXISTS "suppliers_type_idx"   ON "suppliers" ("supplier_type");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "suppliers";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "suppliers"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2) Inventory locations (warehouses, villa storage, carts, supplier dock)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "inventory_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "villa_id"   uuid REFERENCES "villas"("id")   ON DELETE SET NULL,
  "name" text NOT NULL,
  "location_type" text NOT NULL DEFAULT 'warehouse'
    CHECK ("location_type" IN (
      'warehouse','villa_storage','housekeeping_cart','maintenance_room','supplier','disposal'
    )),
  "description" text,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "inv_locations_project_idx" ON "inventory_locations" ("project_id");
CREATE INDEX IF NOT EXISTS "inv_locations_villa_idx"   ON "inventory_locations" ("villa_id");
CREATE INDEX IF NOT EXISTS "inv_locations_type_idx"    ON "inventory_locations" ("location_type");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "inventory_locations";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "inventory_locations"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3) Inventory categories (self-referencing)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "inventory_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "parent_id" uuid REFERENCES "inventory_categories"("id") ON DELETE SET NULL,
  "default_unit" text NOT NULL DEFAULT 'pcs',
  "is_consumable" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "inv_categories_parent_idx" ON "inventory_categories" ("parent_id");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "inventory_categories";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "inventory_categories"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 4) Inventory items
-- =============================================================================
CREATE TABLE IF NOT EXISTS "inventory_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sku" text UNIQUE,
  "name" text NOT NULL,
  "category_id" uuid REFERENCES "inventory_categories"("id") ON DELETE SET NULL,
  "default_supplier_id" uuid REFERENCES "suppliers"("id") ON DELETE SET NULL,
  "unit" text NOT NULL DEFAULT 'pcs',
  "item_type" text NOT NULL DEFAULT 'consumable'
    CHECK ("item_type" IN (
      'consumable','linen','towel','amenity','chemical','spare_part',
      'equipment','furniture','appliance','tool'
    )),
  "description" text,
  "brand" text,
  "model" text,
  "barcode" text,
  "reorder_point" numeric,
  "reorder_quantity" numeric,
  "unit_cost_minor" bigint,
  "currency" text,
  "owner_chargeable" boolean NOT NULL DEFAULT true,
  "track_serial" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "inv_items_status_idx"   ON "inventory_items" ("status");
CREATE INDEX IF NOT EXISTS "inv_items_category_idx" ON "inventory_items" ("category_id");
CREATE INDEX IF NOT EXISTS "inv_items_supplier_idx" ON "inventory_items" ("default_supplier_id");
CREATE INDEX IF NOT EXISTS "inv_items_type_idx"     ON "inventory_items" ("item_type");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "inventory_items";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "inventory_items"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 5) Stock levels (item × location)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "inventory_stock_levels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" uuid NOT NULL REFERENCES "inventory_items"("id") ON DELETE CASCADE,
  "location_id" uuid NOT NULL REFERENCES "inventory_locations"("id") ON DELETE CASCADE,
  "quantity" numeric NOT NULL DEFAULT 0,
  "reserved_quantity" numeric NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "inv_stock_unique"
  ON "inventory_stock_levels" ("item_id","location_id");
CREATE INDEX IF NOT EXISTS "inv_stock_item_idx"     ON "inventory_stock_levels" ("item_id");
CREATE INDEX IF NOT EXISTS "inv_stock_location_idx" ON "inventory_stock_levels" ("location_id");

-- =============================================================================
-- 6) Inventory movements
-- =============================================================================
CREATE TABLE IF NOT EXISTS "inventory_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "movement_code" text NOT NULL UNIQUE,
  "item_id" uuid NOT NULL REFERENCES "inventory_items"("id") ON DELETE RESTRICT,
  "from_location_id" uuid REFERENCES "inventory_locations"("id") ON DELETE SET NULL,
  "to_location_id"   uuid REFERENCES "inventory_locations"("id") ON DELETE SET NULL,
  "quantity" numeric NOT NULL,
  "movement_type" text NOT NULL
    CHECK ("movement_type" IN (
      'receive','consume','transfer','adjust','damage','write_off',
      'return_to_supplier','count_correction'
    )),
  "reason" text,
  "task_id" uuid REFERENCES "operation_tasks"("id") ON DELETE SET NULL,
  "checklist_item_id" uuid REFERENCES "task_checklist_items"("id") ON DELETE SET NULL,
  "damage_report_id" uuid REFERENCES "damage_reports"("id") ON DELETE SET NULL,
  "purchase_order_id" uuid, -- FK added below after purchase_orders table is created
  "unit_cost_minor" bigint,
  "currency" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "inv_movements_item_idx"   ON "inventory_movements" ("item_id");
CREATE INDEX IF NOT EXISTS "inv_movements_type_idx"   ON "inventory_movements" ("movement_type");
CREATE INDEX IF NOT EXISTS "inv_movements_task_idx"   ON "inventory_movements" ("task_id");
CREATE INDEX IF NOT EXISTS "inv_movements_from_idx"   ON "inventory_movements" ("from_location_id");
CREATE INDEX IF NOT EXISTS "inv_movements_to_idx"     ON "inventory_movements" ("to_location_id");
CREATE INDEX IF NOT EXISTS "inv_movements_date_idx"   ON "inventory_movements" ("created_at");

-- =============================================================================
-- 7) Task material usage (records linkage between consume movements and tasks)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "task_material_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "operation_tasks"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "inventory_items"("id") ON DELETE RESTRICT,
  "location_id" uuid REFERENCES "inventory_locations"("id") ON DELETE SET NULL,
  "quantity" numeric NOT NULL,
  "unit_cost_minor" bigint,
  "currency" text,
  "movement_id" uuid REFERENCES "inventory_movements"("id") ON DELETE SET NULL,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tmu_task_idx" ON "task_material_usage" ("task_id");
CREATE INDEX IF NOT EXISTS "tmu_item_idx" ON "task_material_usage" ("item_id");

-- =============================================================================
-- 8) Purchase requests + lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS "purchase_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_code" text NOT NULL UNIQUE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "requested_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "supplier_id" uuid REFERENCES "suppliers"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "priority" text NOT NULL DEFAULT 'normal'
    CHECK ("priority" IN ('low','normal','high','urgent')),
  "status" text NOT NULL DEFAULT 'draft'
    CHECK ("status" IN ('draft','submitted','approved','rejected','ordered','cancelled')),
  "required_by" date,
  "total_estimated_minor" bigint,
  "currency" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pr_status_idx"   ON "purchase_requests" ("status");
CREATE INDEX IF NOT EXISTS "pr_project_idx"  ON "purchase_requests" ("project_id");
CREATE INDEX IF NOT EXISTS "pr_supplier_idx" ON "purchase_requests" ("supplier_id");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "purchase_requests";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "purchase_requests"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "purchase_request_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL REFERENCES "purchase_requests"("id") ON DELETE CASCADE,
  "item_id" uuid REFERENCES "inventory_items"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "quantity" numeric NOT NULL,
  "unit" text NOT NULL DEFAULT 'pcs',
  "estimated_unit_cost_minor" bigint,
  "currency" text,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pr_lines_request_idx" ON "purchase_request_lines" ("request_id");

-- =============================================================================
-- 9) Purchase orders + lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS "purchase_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "po_code" text NOT NULL UNIQUE,
  "request_id" uuid REFERENCES "purchase_requests"("id") ON DELETE SET NULL,
  "supplier_id" uuid REFERENCES "suppliers"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'draft'
    CHECK ("status" IN ('draft','sent','confirmed','partially_received','received','cancelled')),
  "ordered_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "ordered_at" timestamptz,
  "expected_delivery" date,
  "received_at" timestamptz,
  "currency" text,
  "total_minor" bigint,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "po_status_idx"   ON "purchase_orders" ("status");
CREATE INDEX IF NOT EXISTS "po_supplier_idx" ON "purchase_orders" ("supplier_id");
CREATE INDEX IF NOT EXISTS "po_request_idx"  ON "purchase_orders" ("request_id");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "purchase_orders";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "purchase_orders"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "purchase_order_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchase_order_id" uuid NOT NULL REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
  "item_id" uuid REFERENCES "inventory_items"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "quantity_ordered" numeric NOT NULL,
  "quantity_received" numeric NOT NULL DEFAULT 0,
  "unit" text NOT NULL DEFAULT 'pcs',
  "unit_cost_minor" bigint,
  "currency" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "po_lines_po_idx" ON "purchase_order_lines" ("purchase_order_id");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "purchase_order_lines";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "purchase_order_lines"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backfill the deferred FK on inventory_movements.purchase_order_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'inventory_movements_purchase_order_fk'
  ) THEN
    ALTER TABLE "inventory_movements"
      ADD CONSTRAINT inventory_movements_purchase_order_fk
      FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- 10) Inventory counts + lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS "inventory_counts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "count_code" text NOT NULL UNIQUE,
  "location_id" uuid NOT NULL REFERENCES "inventory_locations"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'draft'
    CHECK ("status" IN ('draft','submitted','approved','adjusted','cancelled')),
  "counted_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "approved_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "counted_at" timestamptz,
  "approved_at" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "inv_counts_location_idx" ON "inventory_counts" ("location_id");
CREATE INDEX IF NOT EXISTS "inv_counts_status_idx"   ON "inventory_counts" ("status");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "inventory_counts";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "inventory_counts"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "inventory_count_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "count_id" uuid NOT NULL REFERENCES "inventory_counts"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "inventory_items"("id") ON DELETE CASCADE,
  "expected_quantity" numeric,
  "counted_quantity" numeric NOT NULL,
  "variance_quantity" numeric,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "inv_count_lines_count_idx" ON "inventory_count_lines" ("count_id");

-- =============================================================================
-- 11) task_attachments — Supabase Storage columns
-- =============================================================================
ALTER TABLE "task_attachments"
  ADD COLUMN IF NOT EXISTS "storage_bucket" text,
  ADD COLUMN IF NOT EXISTS "storage_path" text,
  ADD COLUMN IF NOT EXISTS "file_name" text,
  ADD COLUMN IF NOT EXISTS "mime_type" text,
  ADD COLUMN IF NOT EXISTS "size_bytes" integer,
  ADD COLUMN IF NOT EXISTS "upload_status" text NOT NULL DEFAULT 'pending'
    CHECK ("upload_status" IN ('pending','uploaded','failed')),
  ADD COLUMN IF NOT EXISTS "signed_url_expires_at" timestamptz;

-- =============================================================================
-- 12) RLS — internal_read on every new table; mutations via server actions.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'suppliers',
      'inventory_locations',
      'inventory_categories',
      'inventory_items',
      'inventory_stock_levels',
      'inventory_movements',
      'task_material_usage',
      'purchase_requests',
      'purchase_request_lines',
      'purchase_orders',
      'purchase_order_lines',
      'inventory_counts',
      'inventory_count_lines'
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

-- Field staff (housekeeper, technician) need to see active inventory items
-- and stock levels so the field UI can list usable materials. Restrict to
-- active rows; mutations stay server-action only.
DROP POLICY IF EXISTS field_staff_read_active_items ON inventory_items;
CREATE POLICY field_staff_read_active_items ON inventory_items FOR SELECT
USING (
  status = 'active'
  AND EXISTS (
    SELECT 1 FROM app_users u WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
  )
);

DROP POLICY IF EXISTS field_staff_read_stock ON inventory_stock_levels;
CREATE POLICY field_staff_read_stock ON inventory_stock_levels FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM app_users u WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
  )
);

-- Attachments — already RLS-protected via the operations migration's
-- table-level loop on task_attachments. v6 doesn't change those policies
-- but adds Storage object policies via Supabase Storage (configured at
-- bucket level, see ADR-0007 + scripts/storage-policies.sql).

COMMIT;
