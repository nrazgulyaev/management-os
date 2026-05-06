-- =============================================================================
-- 0040 — Development OS · Stage 2.4
--   Site Operations + Vendor CRM + Material Tracking + Safety Incidents.
--
-- 12 new tables across four domains:
--
--   Vendor CRM:
--     - vendors                  legal/operational entity
--     - vendor_engagements       vendor × project, with optional finance link
--
--   Site operations:
--     - site_zones               logical zones per project
--     - site_reports             daily report parent
--     - site_report_zones        per-zone activity within a report
--     - site_report_photos       photo metadata (file in documents)
--     - site_workforce_logs      labor breakdown for cost computation
--
--   Material tracking:
--     - material_purchase_orders parent PO
--     - material_po_lines        ordered line items (with generated total)
--     - material_deliveries      delivery events (1 PO → many deliveries)
--     - material_delivery_lines  received line items
--     - material_consumption_logs material used on site (ties to report + zone)
--
--   Safety:
--     - safety_incidents
--
-- All money in BIGINT minor units. Money lines use generated columns
-- (PostgreSQL 12+ STORED) so totals are immutable computed properties.
--
-- Every table ENABLE+FORCE RLS with internal_read / internal_write policies
-- via public.is_internal_user(). Investors see NONE of these tables — they
-- get default-deny via the absence of any investor SELECT policy.
--
-- All FKs ON DELETE RESTRICT to preserve audit trail, except the parent →
-- child cascades (site_reports → site_report_*, material_pos → material_po_lines,
-- material_deliveries → material_delivery_lines).
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every constraint wrapped in
-- DO $$ ... EXCEPTION WHEN duplicate_object. Wrapped in BEGIN; ... COMMIT;.
-- =============================================================================

BEGIN;

-- =============================================================================
-- VENDOR CRM
-- =============================================================================

-- 1) vendors -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "vendors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_code" text UNIQUE NOT NULL,
  "legal_name" text NOT NULL,
  "legal_entity_type" text,
  "primary_contact_id" uuid REFERENCES "contacts"("id") ON DELETE RESTRICT,

  "vendor_type" text NOT NULL,

  "primary_phone" text,
  "primary_email" text,
  "whatsapp_phone" text,
  "address" text,

  "tax_id" text,
  "business_license_number" text,
  "business_license_expiry" date,

  "bank_name" text,
  "bank_account_holder" text,
  "bank_account_number" text,
  "bank_swift" text,

  "total_commitments_count" integer NOT NULL DEFAULT 0,
  "total_commitments_value_usd_minor" bigint NOT NULL DEFAULT 0,
  "on_time_delivery_rate" numeric(5, 2),
  "quality_rating" numeric(3, 2),
  "last_engagement_at" date,

  "status" text NOT NULL DEFAULT 'active',
  "blacklist_reason" text,
  "blacklisted_at" timestamptz,

  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "vendors" ADD CONSTRAINT vendors_type_check
    CHECK ("vendor_type" IN (
      'general_contractor','subcontractor_civil','subcontractor_mep',
      'subcontractor_finishing','subcontractor_landscaping',
      'architect_designer','engineer_consultant','permits_legal',
      'material_supplier','equipment_rental','logistics_transport',
      'security_services','cleaning_services','other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "vendors" ADD CONSTRAINT vendors_status_check
    CHECK ("status" IN ('active','inactive','blacklisted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "vendors" ADD CONSTRAINT vendors_quality_range_check
    CHECK ("quality_rating" IS NULL
      OR ("quality_rating" >= 0 AND "quality_rating" <= 5));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "vendors" ADD CONSTRAINT vendors_ontime_range_check
    CHECK ("on_time_delivery_rate" IS NULL
      OR ("on_time_delivery_rate" >= 0 AND "on_time_delivery_rate" <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS vendors_status_idx ON "vendors" ("status");
CREATE INDEX IF NOT EXISTS vendors_type_idx ON "vendors" ("vendor_type");
CREATE INDEX IF NOT EXISTS vendors_contact_idx ON "vendors" ("primary_contact_id");

-- 2) vendor_engagements ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "vendor_engagements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,

  "engagement_code" text UNIQUE NOT NULL,
  "scope_description" text NOT NULL,

  "start_date" date NOT NULL,
  "expected_end_date" date,
  "actual_end_date" date,

  "commitment_ledger_id" uuid REFERENCES "dev_commitments_ledger"("id") ON DELETE SET NULL,

  "status" text NOT NULL DEFAULT 'active',
  "termination_reason" text,

  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "vendor_engagements" ADD CONSTRAINT vendor_engagements_status_check
    CHECK ("status" IN ('active','paused','completed','terminated'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS vendor_engagements_vendor_idx ON "vendor_engagements" ("vendor_id");
CREATE INDEX IF NOT EXISTS vendor_engagements_project_idx ON "vendor_engagements" ("project_id");
CREATE INDEX IF NOT EXISTS vendor_engagements_status_idx ON "vendor_engagements" ("status");

-- =============================================================================
-- SITE OPERATIONS
-- =============================================================================

-- 3) site_zones --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "site_zones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "zone_code" text NOT NULL,
  "zone_name" text NOT NULL,
  "zone_name_translations" jsonb,

  "zone_type" text NOT NULL,

  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,

  "expected_start_date" date,
  "expected_completion_date" date,
  "actual_start_date" date,
  "actual_completion_date" date,

  "display_order" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  UNIQUE ("project_id", "zone_code")
);

DO $$ BEGIN
  ALTER TABLE "site_zones" ADD CONSTRAINT site_zones_type_check
    CHECK ("zone_type" IN (
      'foundation','structure','mep','finishing','landscaping',
      'infrastructure','common_area','other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS site_zones_project_idx ON "site_zones" ("project_id");
CREATE INDEX IF NOT EXISTS site_zones_type_idx ON "site_zones" ("zone_type");
CREATE INDEX IF NOT EXISTS site_zones_villa_idx ON "site_zones" ("villa_id");

-- 4) site_reports ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "site_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "report_date" date NOT NULL,

  "weather_conditions" text,
  "weather_notes" text,
  "temperature_celsius_min" integer,
  "temperature_celsius_max" integer,

  "total_workers_present" integer NOT NULL DEFAULT 0,
  "total_workers_planned" integer,

  "summary" text,
  "summary_translations" jsonb,

  "reported_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reporter_role" text,

  "status" text NOT NULL DEFAULT 'draft',
  "submitted_at" timestamptz,
  "reviewed_at" timestamptz,
  "reviewed_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reviewer_notes" text,

  "source_channel" text NOT NULL DEFAULT 'web',
  "source_message_id" text,

  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  UNIQUE ("project_id", "report_date")
);

DO $$ BEGIN
  ALTER TABLE "site_reports" ADD CONSTRAINT site_reports_status_check
    CHECK ("status" IN ('draft','submitted','reviewed','flagged'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "site_reports" ADD CONSTRAINT site_reports_source_check
    CHECK ("source_channel" IN ('web','whatsapp','mobile_app','api'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS site_reports_project_date_idx
  ON "site_reports" ("project_id", "report_date" DESC);
CREATE INDEX IF NOT EXISTS site_reports_status_idx ON "site_reports" ("status");
CREATE INDEX IF NOT EXISTS site_reports_reporter_idx ON "site_reports" ("reported_by");

-- 5) site_report_zones -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "site_report_zones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_report_id" uuid NOT NULL REFERENCES "site_reports"("id") ON DELETE CASCADE,
  "zone_id" uuid NOT NULL REFERENCES "site_zones"("id") ON DELETE RESTRICT,

  "activities_completed" text[],
  "activities_planned_tomorrow" text[],

  "workers_in_zone" integer NOT NULL DEFAULT 0,
  "vendor_engagement_id" uuid REFERENCES "vendor_engagements"("id") ON DELETE SET NULL,

  "progress_percent_today" numeric(5, 2),
  "cumulative_progress_percent" numeric(5, 2),

  "has_blocker" boolean NOT NULL DEFAULT false,
  "blocker_description" text,

  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),

  UNIQUE ("site_report_id", "zone_id")
);

CREATE INDEX IF NOT EXISTS site_report_zones_report_idx
  ON "site_report_zones" ("site_report_id");
CREATE INDEX IF NOT EXISTS site_report_zones_zone_idx
  ON "site_report_zones" ("zone_id");
CREATE INDEX IF NOT EXISTS site_report_zones_blocker_idx
  ON "site_report_zones" ("has_blocker") WHERE "has_blocker" = true;

-- 6) site_report_photos ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "site_report_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_report_id" uuid NOT NULL REFERENCES "site_reports"("id") ON DELETE CASCADE,
  "zone_id" uuid REFERENCES "site_zones"("id") ON DELETE SET NULL,

  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE RESTRICT,

  "caption" text,
  "photo_taken_at" timestamptz NOT NULL,

  "ai_analyzed_at" timestamptz,
  "ai_detected_objects" jsonb,
  "ai_progress_inferred" numeric(5, 2),
  "ai_safety_concerns" text[],
  "ai_quality_concerns" text[],

  "gps_lat" numeric(10, 7),
  "gps_lng" numeric(10, 7),

  "uploaded_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_report_photos_report_idx
  ON "site_report_photos" ("site_report_id");
CREATE INDEX IF NOT EXISTS site_report_photos_zone_idx
  ON "site_report_photos" ("zone_id");
CREATE INDEX IF NOT EXISTS site_report_photos_taken_idx
  ON "site_report_photos" ("photo_taken_at" DESC);

-- 7) site_workforce_logs -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "site_workforce_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_report_id" uuid NOT NULL REFERENCES "site_reports"("id") ON DELETE CASCADE,
  "vendor_engagement_id" uuid REFERENCES "vendor_engagements"("id") ON DELETE RESTRICT,

  "role_category" text NOT NULL,
  "worker_count" integer NOT NULL,
  "hours_per_worker" numeric(5, 2) NOT NULL DEFAULT 8.0,
  "total_man_hours" numeric(10, 2)
    GENERATED ALWAYS AS ("worker_count" * "hours_per_worker") STORED,

  "rate_per_hour_minor" bigint,
  "rate_currency" text,
  -- Cost computed in plain SQL (not generated) so we can store the
  -- post-FX USD figure too. Both are nullable when no rate is provided.
  "estimated_cost_minor" bigint,
  "estimated_cost_usd_minor" bigint,

  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "site_workforce_logs" ADD CONSTRAINT workforce_logs_role_check
    CHECK ("role_category" IN (
      'foreman','skilled_worker','unskilled_worker','specialist',
      'equipment_operator','helper'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "site_workforce_logs" ADD CONSTRAINT workforce_logs_count_positive_check
    CHECK ("worker_count" >= 0 AND "hours_per_worker" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS site_workforce_logs_report_idx
  ON "site_workforce_logs" ("site_report_id");
CREATE INDEX IF NOT EXISTS site_workforce_logs_engagement_idx
  ON "site_workforce_logs" ("vendor_engagement_id");

-- =============================================================================
-- MATERIAL TRACKING
-- =============================================================================

-- 8) material_purchase_orders ------------------------------------------------
CREATE TABLE IF NOT EXISTS "material_purchase_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "po_code" text UNIQUE NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,

  "commitment_ledger_id" uuid REFERENCES "dev_commitments_ledger"("id") ON DELETE SET NULL,

  "order_date" date NOT NULL,
  "expected_delivery_date" date,
  "status" text NOT NULL DEFAULT 'ordered',

  "total_amount_usd_minor" bigint NOT NULL,
  "total_amount_currency" text NOT NULL,
  "total_amount_original_minor" bigint NOT NULL,
  "fx_rate_at_order" numeric(20, 8) NOT NULL,

  "po_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,

  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "material_purchase_orders" ADD CONSTRAINT material_pos_status_check
    CHECK ("status" IN ('draft','ordered','partially_delivered','fully_delivered','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "material_purchase_orders" ADD CONSTRAINT material_pos_currency_check
    CHECK ("total_amount_currency" IN ('USD','IDR','RUB','EUR','USDT','CNY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS material_pos_project_idx
  ON "material_purchase_orders" ("project_id");
CREATE INDEX IF NOT EXISTS material_pos_vendor_idx
  ON "material_purchase_orders" ("vendor_id");
CREATE INDEX IF NOT EXISTS material_pos_status_idx
  ON "material_purchase_orders" ("status");
CREATE INDEX IF NOT EXISTS material_pos_expected_delivery_idx
  ON "material_purchase_orders" ("expected_delivery_date");

-- 9) material_po_lines -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "material_po_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "po_id" uuid NOT NULL REFERENCES "material_purchase_orders"("id") ON DELETE CASCADE,

  "line_number" integer NOT NULL,

  "material_name" text NOT NULL,
  "material_category" text,
  "unit_of_measure" text NOT NULL,
  "quantity_ordered" numeric(15, 4) NOT NULL,
  "unit_price_usd_minor" bigint NOT NULL,
  "unit_price_original_minor" bigint NOT NULL,

  "line_total_usd_minor" bigint
    GENERATED ALWAYS AS (("unit_price_usd_minor" * "quantity_ordered")::bigint) STORED,

  "quantity_delivered" numeric(15, 4) NOT NULL DEFAULT 0,
  "quantity_consumed" numeric(15, 4) NOT NULL DEFAULT 0,

  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),

  UNIQUE ("po_id", "line_number")
);

CREATE INDEX IF NOT EXISTS material_po_lines_po_idx ON "material_po_lines" ("po_id");
CREATE INDEX IF NOT EXISTS material_po_lines_category_idx
  ON "material_po_lines" ("material_category");

-- 10) material_deliveries ----------------------------------------------------
CREATE TABLE IF NOT EXISTS "material_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "delivery_code" text UNIQUE NOT NULL,
  "po_id" uuid NOT NULL REFERENCES "material_purchase_orders"("id") ON DELETE RESTRICT,

  "delivery_date" date NOT NULL,
  "received_at" timestamptz,
  "received_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,

  "related_site_report_id" uuid REFERENCES "site_reports"("id") ON DELETE SET NULL,

  "delivery_note_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,

  "quality_check_status" text NOT NULL DEFAULT 'pending',
  "quality_notes" text,

  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "material_deliveries" ADD CONSTRAINT material_deliveries_quality_check
    CHECK ("quality_check_status" IN ('pending','accepted','partial_acceptance','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS material_deliveries_po_idx ON "material_deliveries" ("po_id");
CREATE INDEX IF NOT EXISTS material_deliveries_date_idx
  ON "material_deliveries" ("delivery_date" DESC);
CREATE INDEX IF NOT EXISTS material_deliveries_report_idx
  ON "material_deliveries" ("related_site_report_id");

-- 11) material_delivery_lines ------------------------------------------------
CREATE TABLE IF NOT EXISTS "material_delivery_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "delivery_id" uuid NOT NULL REFERENCES "material_deliveries"("id") ON DELETE CASCADE,
  "po_line_id" uuid NOT NULL REFERENCES "material_po_lines"("id") ON DELETE RESTRICT,

  "quantity_received" numeric(15, 4) NOT NULL,
  "quality_check_passed" boolean NOT NULL DEFAULT true,
  "rejection_reason" text,

  "stored_in_zone_id" uuid REFERENCES "site_zones"("id") ON DELETE SET NULL,

  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_delivery_lines_delivery_idx
  ON "material_delivery_lines" ("delivery_id");
CREATE INDEX IF NOT EXISTS material_delivery_lines_po_line_idx
  ON "material_delivery_lines" ("po_line_id");

-- 12) material_consumption_logs ----------------------------------------------
CREATE TABLE IF NOT EXISTS "material_consumption_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_report_id" uuid NOT NULL REFERENCES "site_reports"("id") ON DELETE RESTRICT,
  "zone_id" uuid NOT NULL REFERENCES "site_zones"("id") ON DELETE RESTRICT,
  "po_line_id" uuid NOT NULL REFERENCES "material_po_lines"("id") ON DELETE RESTRICT,

  "quantity_consumed" numeric(15, 4) NOT NULL,
  "consumed_at" timestamptz NOT NULL,

  "notes" text,
  "recorded_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_consumption_report_idx
  ON "material_consumption_logs" ("site_report_id");
CREATE INDEX IF NOT EXISTS material_consumption_zone_idx
  ON "material_consumption_logs" ("zone_id");
CREATE INDEX IF NOT EXISTS material_consumption_po_line_idx
  ON "material_consumption_logs" ("po_line_id");

-- =============================================================================
-- SAFETY
-- =============================================================================

-- 13) safety_incidents -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "safety_incidents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "incident_code" text UNIQUE NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "zone_id" uuid REFERENCES "site_zones"("id") ON DELETE SET NULL,
  "related_site_report_id" uuid REFERENCES "site_reports"("id") ON DELETE SET NULL,

  "incident_date" date NOT NULL,
  "incident_time" time,

  "severity" text NOT NULL,
  "category" text NOT NULL,

  "affected_workers_count" integer NOT NULL DEFAULT 0,
  "vendor_engagement_id" uuid REFERENCES "vendor_engagements"("id") ON DELETE SET NULL,

  "description" text NOT NULL,

  "immediate_actions_taken" text,
  "reported_to_authorities" boolean NOT NULL DEFAULT false,
  "authority_report_reference" text,

  "photo_document_ids" uuid[],
  "report_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,

  "status" text NOT NULL DEFAULT 'open',
  "resolution_notes" text,
  "resolved_at" timestamptz,

  "reported_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "safety_incidents" ADD CONSTRAINT safety_severity_check
    CHECK ("severity" IN ('near_miss','minor','moderate','severe','fatal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "safety_incidents" ADD CONSTRAINT safety_category_check
    CHECK ("category" IN (
      'fall','electrical','equipment','material_handling','fire','chemical',
      'structural','vehicle','weather','other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "safety_incidents" ADD CONSTRAINT safety_status_check
    CHECK ("status" IN ('open','under_investigation','resolved','closed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS safety_incidents_project_idx
  ON "safety_incidents" ("project_id");
CREATE INDEX IF NOT EXISTS safety_incidents_severity_idx
  ON "safety_incidents" ("severity");
CREATE INDEX IF NOT EXISTS safety_incidents_status_idx
  ON "safety_incidents" ("status");
CREATE INDEX IF NOT EXISTS safety_incidents_date_idx
  ON "safety_incidents" ("incident_date" DESC);

-- =============================================================================
-- Notification rules trigger_event widening (4 new events)
-- =============================================================================
DO $$ BEGIN
  ALTER TABLE "dev_notification_rules"
    DROP CONSTRAINT IF EXISTS notification_rules_trigger_check;
  ALTER TABLE "dev_notification_rules"
    ADD CONSTRAINT notification_rules_trigger_check
    CHECK ("trigger_event" IN (
      -- Stage 2.2.B
      'milestone_pre_invoice_due','milestone_invoice_due','milestone_overdue',
      'milestone_overdue_critical','reservation_expiring','contract_pending_signature',
      'late_fee_accrued','discount_pending_approval','system_event',
      -- Stage 2.3.B
      'drawdown_overdue','bank_balance_below_threshold',
      'project_self_sustaining_reached','project_self_sustaining_lost',
      'bank_balance_discrepancy',
      -- Stage 2.4
      'material_delivery_overdue','site_report_missing',
      'safety_incident_severe','safety_incident_unresolved_24h'
    ));
END $$;

-- =============================================================================
-- RLS — internal-only read/write; investors get default-deny
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'vendors',
      'vendor_engagements',
      'site_zones',
      'site_reports',
      'site_report_zones',
      'site_report_photos',
      'site_workforce_logs',
      'material_purchase_orders',
      'material_po_lines',
      'material_deliveries',
      'material_delivery_lines',
      'material_consumption_logs',
      'safety_incidents'
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
