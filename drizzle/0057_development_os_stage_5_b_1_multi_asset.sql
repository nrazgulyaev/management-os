-- =============================================================================
-- 0057 — Development OS · Stage 5.B.1 — Multi-Asset Refactor
--
-- Strategy B: keep `villas` table name (preserves 60+ FK constraints),
-- add asset_type_id + asset_attributes JSONB, backfill all existing rows
-- to asset_type='villa', then create read-only `assets` view for new code.
--
-- New tables:
--   - asset_types         registry of asset types (12 default seeds)
--   - revenue_streams     ongoing revenue from non-saleable assets
--
-- Modified tables:
--   - villas              + asset_type_id (NOT NULL after backfill) + asset_attributes
--
-- New view:
--   - assets              read-only: villas + asset_types
--
-- All RLS-protected, internal-only.
--
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) asset_types — registry
-- =============================================================================

CREATE TABLE IF NOT EXISTS "asset_types" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "type_key" TEXT UNIQUE NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT,

  "asset_category" TEXT NOT NULL CHECK ("asset_category" IN (
    'residential',
    'hospitality',
    'food_beverage',
    'wellness',
    'mixed_use',
    'commercial',
    'land',
    'amenity',
    'other'
  )),

  "default_attributes_schema" JSONB,

  "is_saleable" BOOLEAN NOT NULL DEFAULT TRUE,
  "is_rentable" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_revenue_generating" BOOLEAN NOT NULL DEFAULT TRUE,

  "display_order" INTEGER NOT NULL DEFAULT 0,
  "icon_key" TEXT,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "asset_types_category_idx"
  ON "asset_types"("asset_category");
CREATE INDEX IF NOT EXISTS "asset_types_active_idx"
  ON "asset_types"("is_active");

CREATE OR REPLACE FUNCTION "asset_types_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_asset_types_updated_at" ON "asset_types";
CREATE TRIGGER "trg_asset_types_updated_at"
  BEFORE UPDATE ON "asset_types"
  FOR EACH ROW EXECUTE FUNCTION "asset_types_set_updated_at"();

-- Seed 12 default asset types (idempotent via ON CONFLICT).
INSERT INTO "asset_types" (type_key, display_name, asset_category, is_saleable, is_rentable, display_order) VALUES
  ('villa',                 'Villa',               'residential',   TRUE,  TRUE,  10),
  ('apartment',             'Apartment',           'residential',   TRUE,  TRUE,  20),
  ('hotel_room',            'Hotel Room',          'hospitality',   FALSE, TRUE,  30),
  ('hotel_suite',           'Hotel Suite',         'hospitality',   FALSE, TRUE,  40),
  ('restaurant_table',      'Restaurant Seat',     'food_beverage', FALSE, TRUE,  50),
  ('spa_treatment_room',    'Spa Treatment Room',  'wellness',      FALSE, TRUE,  60),
  ('mixed_use_unit',        'Mixed-Use Unit',      'mixed_use',     TRUE,  TRUE,  70),
  ('retail_space',          'Retail Space',        'commercial',    FALSE, TRUE,  80),
  ('office_space',          'Office Space',        'commercial',    FALSE, TRUE,  90),
  ('land_parcel',           'Land Parcel',         'land',          TRUE,  FALSE, 100),
  ('pool',                  'Pool',                'amenity',       FALSE, FALSE, 110),
  ('common_area',           'Common Area',         'amenity',       FALSE, FALSE, 120)
ON CONFLICT (type_key) DO NOTHING;


-- =============================================================================
-- 2) Extend villas with asset_type_id + asset_attributes
-- =============================================================================

ALTER TABLE "villas"
  ADD COLUMN IF NOT EXISTS "asset_type_id" UUID REFERENCES "asset_types"("id"),
  ADD COLUMN IF NOT EXISTS "asset_attributes" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill all existing villas to asset_type='villa'.
UPDATE "villas"
   SET "asset_type_id" = (
     SELECT id FROM "asset_types" WHERE type_key = 'villa'
   )
 WHERE "asset_type_id" IS NULL;

-- Now make NOT NULL — partial state impossible because we're inside one
-- transaction with the UPDATE above.
ALTER TABLE "villas"
  ALTER COLUMN "asset_type_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "villas_asset_type_idx"
  ON "villas"("asset_type_id");
CREATE INDEX IF NOT EXISTS "villas_asset_attributes_gin_idx"
  ON "villas" USING GIN ("asset_attributes");


-- =============================================================================
-- 3) Documentation comments — name preserved, semantics multi-asset
-- =============================================================================

COMMENT ON TABLE "villas" IS 'Generic asset registry. Originally villa-only, now supports hotel_room, restaurant_table, etc. via asset_type_id. Table name preserved for FK compatibility (60+ existing FKs).';
COMMENT ON COLUMN "villas"."asset_type_id" IS 'References asset_types registry. Default villa for backward compatibility.';
COMMENT ON COLUMN "villas"."asset_attributes" IS 'Type-specific attributes (JSONB). Schema varies by asset_type. Examples: villa: {bedrooms, pool, sqm}, hotel_room: {category, view, max_guests}, restaurant_table: {seats, location_type}';


-- =============================================================================
-- 4) `assets` read-only view — joins villas + asset_types
-- =============================================================================

CREATE OR REPLACE VIEW "assets" AS
SELECT
  v.*,
  at.type_key                    AS asset_type_key,
  at.display_name                AS asset_type_display_name,
  at.asset_category              AS asset_category,
  at.is_saleable                 AS type_is_saleable,
  at.is_rentable                 AS type_is_rentable,
  at.is_revenue_generating       AS type_is_revenue_generating
FROM "villas" v
LEFT JOIN "asset_types" at ON at.id = v.asset_type_id;

COMMENT ON VIEW "assets" IS 'Read-only multi-asset view. For new code, prefer this view. Existing code continues using villas table directly.';


-- =============================================================================
-- 5) revenue_streams — ongoing revenue from non-saleable assets
-- =============================================================================

CREATE TABLE IF NOT EXISTS "revenue_streams" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "asset_id" UUID NOT NULL REFERENCES "villas"("id"),
  "project_id" UUID NOT NULL REFERENCES "projects"("id"),

  "stream_type" TEXT NOT NULL CHECK ("stream_type" IN (
    'hotel_room_revenue', 'restaurant_revenue', 'spa_revenue',
    'rental_income', 'service_fee', 'membership_fee', 'event_revenue', 'other'
  )),

  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,

  "gross_revenue_minor" BIGINT NOT NULL,
  "occupancy_rate" NUMERIC(5,2),
  "average_daily_rate_minor" BIGINT,
  "units_sold" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'IDR',

  "direct_costs_minor" BIGINT NOT NULL DEFAULT 0,
  "net_revenue_minor" BIGINT GENERATED ALWAYS AS (
    "gross_revenue_minor" - "direct_costs_minor"
  ) STORED,

  "data_source" TEXT,
  "imported_at" TIMESTAMPTZ,

  "notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK ("period_end" >= "period_start")
);

CREATE INDEX IF NOT EXISTS "revenue_streams_asset_idx"
  ON "revenue_streams"("asset_id");
CREATE INDEX IF NOT EXISTS "revenue_streams_project_idx"
  ON "revenue_streams"("project_id");
CREATE INDEX IF NOT EXISTS "revenue_streams_period_idx"
  ON "revenue_streams"("period_start", "period_end");
CREATE INDEX IF NOT EXISTS "revenue_streams_type_idx"
  ON "revenue_streams"("stream_type");

CREATE OR REPLACE FUNCTION "revenue_streams_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_revenue_streams_updated_at" ON "revenue_streams";
CREATE TRIGGER "trg_revenue_streams_updated_at"
  BEFORE UPDATE ON "revenue_streams"
  FOR EACH ROW EXECUTE FUNCTION "revenue_streams_set_updated_at"();


-- =============================================================================
-- 6) RLS — internal-only on new tables
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['asset_types', 'revenue_streams'])
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
