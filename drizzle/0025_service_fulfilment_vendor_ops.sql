-- =============================================================================
-- Prompt 103 — Service Fulfilment & Vendor Ops.
--
-- Eight new tables back the operational fulfilment layer for guest
-- service orders:
--
--   service_vendors                 — vendor / supplier registry
--   service_vendor_services         — vendor ↔ guest_services capability
--   guest_service_fulfilments       — operational fulfilment for an order
--   service_fulfilment_events       — append-only fulfilment timeline
--   service_vendor_tokens           — vendor-portal access tokens
--   service_vendor_invoices         — vendor invoice tracking
--   guest_service_ratings           — post-fulfilment guest ratings
--   service_fulfilment_finance_links — idempotent finance bridge
--
-- All eight enable + force RLS; only internal users get policies.
-- Vendor-portal access flows through token-gated server routes
-- (no PostgREST surface). Owners never read these tables — the
-- existing `owner_visible_events` projection is the only way owner
-- visibility leaks back to the calendar.
-- =============================================================================

-- 1) service_vendors
CREATE TABLE IF NOT EXISTS "service_vendors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_code" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "legal_name" text,
  "vendor_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "contact_name" text,
  "contact_phone" text,
  "contact_email" text,
  "preferred_channel" text,
  "service_area" text,
  "languages" text[],
  "default_currency" text NOT NULL DEFAULT 'USD',
  "internal_notes" text,
  "rating_average" numeric(3, 2),
  "rating_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "service_vendors"
    ADD CONSTRAINT service_vendors_status_check
    CHECK ("status" IN ('active','paused','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "service_vendors"
    ADD CONSTRAINT service_vendors_type_check
    CHECK ("vendor_type" IN (
      'transport','chef','wellness','laundry','rental','activity',
      'maintenance','other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "service_vendors_status_idx"
  ON "service_vendors" ("status");
CREATE INDEX IF NOT EXISTS "service_vendors_type_idx"
  ON "service_vendors" ("vendor_type");
CREATE INDEX IF NOT EXISTS "service_vendors_display_name_idx"
  ON "service_vendors" ("display_name");

-- 2) service_vendor_services
CREATE TABLE IF NOT EXISTS "service_vendor_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_id" uuid NOT NULL REFERENCES "service_vendors"("id") ON DELETE CASCADE,
  "service_id" uuid NOT NULL REFERENCES "guest_services"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'active',
  "base_cost_minor" bigint,
  "currency" text,
  "lead_time_minutes" integer,
  "min_notice_minutes" integer,
  "capacity_json" jsonb,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "service_vendor_services"
    ADD CONSTRAINT service_vendor_services_status_check
    CHECK ("status" IN ('active','paused','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "service_vendor_services_pair_unique"
  ON "service_vendor_services" ("vendor_id", "service_id");
CREATE INDEX IF NOT EXISTS "service_vendor_services_service_idx"
  ON "service_vendor_services" ("service_id");
CREATE INDEX IF NOT EXISTS "service_vendor_services_status_idx"
  ON "service_vendor_services" ("status");

-- 3) guest_service_fulfilments
CREATE TABLE IF NOT EXISTS "guest_service_fulfilments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "guest_service_orders"("id") ON DELETE CASCADE,
  "fulfilment_code" text NOT NULL UNIQUE,
  "vendor_id" uuid REFERENCES "service_vendors"("id") ON DELETE SET NULL,
  "assigned_to_app_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'new',
  "fulfilment_type" text NOT NULL DEFAULT 'internal',
  "scheduled_for" timestamptz,
  "eta_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancellation_reason" text,
  "guest_status_label" text,
  "internal_status_reason" text,
  "vendor_quote_minor" bigint,
  "internal_cost_minor" bigint,
  "guest_price_minor" bigint,
  "currency" text NOT NULL DEFAULT 'USD',
  "margin_minor" bigint,
  "requires_guest_confirmation" boolean NOT NULL DEFAULT false,
  "guest_confirmed_at" timestamptz,
  "vendor_confirmed_at" timestamptz,
  "vendor_reference" text,
  "vendor_notes" text,
  "internal_notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_service_fulfilments"
    ADD CONSTRAINT guest_service_fulfilments_status_check
    CHECK ("status" IN (
      'new','triage','awaiting_vendor','vendor_confirmed','guest_confirmed',
      'scheduled','in_progress','completed','cancelled','failed','no_show'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_service_fulfilments"
    ADD CONSTRAINT guest_service_fulfilments_type_check
    CHECK ("fulfilment_type" IN ('internal','vendor','hybrid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "guest_service_fulfilments_order_unique"
  ON "guest_service_fulfilments" ("order_id");
CREATE INDEX IF NOT EXISTS "guest_service_fulfilments_status_idx"
  ON "guest_service_fulfilments" ("status");
CREATE INDEX IF NOT EXISTS "guest_service_fulfilments_vendor_idx"
  ON "guest_service_fulfilments" ("vendor_id");
CREATE INDEX IF NOT EXISTS "guest_service_fulfilments_scheduled_idx"
  ON "guest_service_fulfilments" ("scheduled_for");
CREATE INDEX IF NOT EXISTS "guest_service_fulfilments_assigned_idx"
  ON "guest_service_fulfilments" ("assigned_to_app_user_id");

-- 4) service_fulfilment_events
CREATE TABLE IF NOT EXISTS "service_fulfilment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fulfilment_id" uuid NOT NULL REFERENCES "guest_service_fulfilments"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "actor_type" text NOT NULL DEFAULT 'system',
  "actor_app_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "vendor_id" uuid REFERENCES "service_vendors"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "metadata_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "service_fulfilment_events"
    ADD CONSTRAINT service_fulfilment_events_actor_check
    CHECK ("actor_type" IN ('system','admin','vendor','guest'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "service_fulfilment_events_fulfilment_idx"
  ON "service_fulfilment_events" ("fulfilment_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "service_fulfilment_events_type_idx"
  ON "service_fulfilment_events" ("event_type");

-- 5) service_vendor_tokens
CREATE TABLE IF NOT EXISTS "service_vendor_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fulfilment_id" uuid NOT NULL REFERENCES "guest_service_fulfilments"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL REFERENCES "service_vendors"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "token_prefix" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "expires_at" timestamptz NOT NULL,
  "last_accessed_at" timestamptz,
  "access_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "service_vendor_tokens"
    ADD CONSTRAINT service_vendor_tokens_status_check
    CHECK ("status" IN ('active','revoked','expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "service_vendor_tokens_vendor_idx"
  ON "service_vendor_tokens" ("vendor_id");
CREATE INDEX IF NOT EXISTS "service_vendor_tokens_fulfilment_idx"
  ON "service_vendor_tokens" ("fulfilment_id");
CREATE INDEX IF NOT EXISTS "service_vendor_tokens_status_idx"
  ON "service_vendor_tokens" ("status");
CREATE INDEX IF NOT EXISTS "service_vendor_tokens_expires_idx"
  ON "service_vendor_tokens" ("expires_at");

-- 6) service_vendor_invoices
CREATE TABLE IF NOT EXISTS "service_vendor_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fulfilment_id" uuid NOT NULL REFERENCES "guest_service_fulfilments"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL REFERENCES "service_vendors"("id") ON DELETE CASCADE,
  "invoice_number" text,
  "invoice_status" text NOT NULL DEFAULT 'draft',
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "invoice_date" date,
  "due_date" date,
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "notes" text,
  "approved_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "paid_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "service_vendor_invoices"
    ADD CONSTRAINT service_vendor_invoices_status_check
    CHECK ("invoice_status" IN (
      'draft','received','approved','rejected','paid','cancelled'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "service_vendor_invoices_vendor_idx"
  ON "service_vendor_invoices" ("vendor_id");
CREATE INDEX IF NOT EXISTS "service_vendor_invoices_fulfilment_idx"
  ON "service_vendor_invoices" ("fulfilment_id");
CREATE INDEX IF NOT EXISTS "service_vendor_invoices_status_idx"
  ON "service_vendor_invoices" ("invoice_status");
CREATE INDEX IF NOT EXISTS "service_vendor_invoices_due_idx"
  ON "service_vendor_invoices" ("due_date");

-- 7) guest_service_ratings
CREATE TABLE IF NOT EXISTS "guest_service_ratings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid REFERENCES "guest_service_orders"("id") ON DELETE SET NULL,
  "fulfilment_id" uuid NOT NULL REFERENCES "guest_service_fulfilments"("id") ON DELETE CASCADE,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "stay_token_id" uuid REFERENCES "guest_stay_tokens"("id") ON DELETE SET NULL,
  "vendor_id" uuid REFERENCES "service_vendors"("id") ON DELETE SET NULL,
  "rating" integer NOT NULL,
  "comment" text,
  "sentiment" text,
  "status" text NOT NULL DEFAULT 'published',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_service_ratings"
    ADD CONSTRAINT guest_service_ratings_rating_check
    CHECK ("rating" BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_service_ratings"
    ADD CONSTRAINT guest_service_ratings_status_check
    CHECK ("status" IN ('draft','published','hidden','flagged'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_service_ratings"
    ADD CONSTRAINT guest_service_ratings_sentiment_check
    CHECK (
      "sentiment" IS NULL OR
      "sentiment" IN ('positive','neutral','negative','mixed')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "guest_service_ratings_fulfilment_token_unique"
  ON "guest_service_ratings" ("fulfilment_id", "stay_token_id");
CREATE INDEX IF NOT EXISTS "guest_service_ratings_vendor_idx"
  ON "guest_service_ratings" ("vendor_id");
CREATE INDEX IF NOT EXISTS "guest_service_ratings_status_idx"
  ON "guest_service_ratings" ("status");

-- 8) service_fulfilment_finance_links
CREATE TABLE IF NOT EXISTS "service_fulfilment_finance_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fulfilment_id" uuid NOT NULL REFERENCES "guest_service_fulfilments"("id") ON DELETE CASCADE,
  "order_id" uuid NOT NULL REFERENCES "guest_service_orders"("id") ON DELETE CASCADE,
  "revenue_line_id" uuid REFERENCES "revenue_lines"("id") ON DELETE SET NULL,
  "expense_line_id" uuid REFERENCES "expense_lines"("id") ON DELETE SET NULL,
  "vendor_invoice_id" uuid REFERENCES "service_vendor_invoices"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "amount_revenue_minor" bigint,
  "amount_expense_minor" bigint,
  "currency" text,
  "error_message" text,
  "bridged_at" timestamptz,
  "reversed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "service_fulfilment_finance_links"
    ADD CONSTRAINT service_fulfilment_finance_links_status_check
    CHECK ("status" IN (
      'pending','bridged','skipped_no_amount','skipped_locked_period','failed','reversed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "service_fulfilment_finance_links_fulfilment_unique"
  ON "service_fulfilment_finance_links" ("fulfilment_id");
CREATE INDEX IF NOT EXISTS "service_fulfilment_finance_links_status_idx"
  ON "service_fulfilment_finance_links" ("status");

-- =============================================================================
-- RLS — internal-only writes; vendor / guest access flows through token-
-- gated server routes only (no PostgREST surface exposes these tables).
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'service_vendors',
      'service_vendor_services',
      'guest_service_fulfilments',
      'service_fulfilment_events',
      'service_vendor_tokens',
      'service_vendor_invoices',
      'guest_service_ratings',
      'service_fulfilment_finance_links'
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
