-- =============================================================================
-- 0016 — Guest services catalog + upsell orders + concierge fulfilment +
-- guest-service revenue foundation (v9F).
--
-- Adds:
--   • `guest_service_categories`            – top-level catalog grouping
--   • `guest_services`                      – villa- / project- / global-scoped
--                                             services with pricing + flags
--   • `guest_service_options`               – option deltas (60/90 min, 2/3-course…)
--   • `guest_service_orders`                – guest-submitted requests + lifecycle
--   • `guest_service_order_events`          – append-only audit per order
--   • `guest_service_finance_links`         – idempotent revenue-line bridge
--
-- All money in BIGINT minor units. No payments, no Stripe/Xendit. The
-- finance bridge writes revenue_lines only — internal cost stays on the
-- order row for margin analytics (see ADR-0017).
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) guest_service_categories
CREATE TABLE IF NOT EXISTS "guest_service_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "icon" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_service_categories"
    ADD CONSTRAINT guest_service_categories_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_service_categories_status_idx"
  ON "guest_service_categories" ("status");

-- 2) guest_services
CREATE TABLE IF NOT EXISTS "guest_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_id" uuid REFERENCES "guest_service_categories"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "service_key" text NOT NULL,
  "name" text NOT NULL,
  "short_description" text,
  "description_md" text,
  "image_url" text,
  "service_type" text NOT NULL,
  "pricing_model" text NOT NULL DEFAULT 'fixed',
  "base_price_minor" bigint NOT NULL DEFAULT 0,
  "internal_cost_minor" bigint,
  "currency" text NOT NULL DEFAULT 'USD',
  "requires_date" boolean NOT NULL DEFAULT true,
  "requires_time" boolean NOT NULL DEFAULT false,
  "requires_guest_count" boolean NOT NULL DEFAULT false,
  "requires_admin_confirmation" boolean NOT NULL DEFAULT true,
  "allow_multiple_days" boolean NOT NULL DEFAULT false,
  "min_quantity" integer NOT NULL DEFAULT 1,
  "max_quantity" integer,
  "lead_time_hours" integer,
  "cancellation_policy_md" text,
  "guest_visible" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'active',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_services"
    ADD CONSTRAINT guest_services_status_check
    CHECK ("status" IN ('active','paused','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_services"
    ADD CONSTRAINT guest_services_pricing_model_check
    CHECK ("pricing_model" IN (
      'fixed','per_person','per_day','per_hour','per_item',
      'quote_required','free'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_services"
    ADD CONSTRAINT guest_services_service_type_check
    CHECK ("service_type" IN (
      'transfer','chef','breakfast','massage','vehicle','equipment',
      'experience','housekeeping','laundry','late_checkout',
      'early_checkin','other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Partial unique index: at most one non-archived row per
-- (project_id, villa_id, service_key). Keeps catalog edits clean — a
-- villa can override a project-scoped service by inserting a row with
-- the same `service_key` AND a non-null villa_id.
CREATE UNIQUE INDEX IF NOT EXISTS "guest_services_scope_key_unique"
  ON "guest_services" (
    COALESCE("project_id", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("villa_id",   '00000000-0000-0000-0000-000000000000'::uuid),
    "service_key"
  )
  WHERE "status" <> 'archived';

CREATE INDEX IF NOT EXISTS "guest_services_category_idx"
  ON "guest_services" ("category_id");
CREATE INDEX IF NOT EXISTS "guest_services_project_idx"
  ON "guest_services" ("project_id");
CREATE INDEX IF NOT EXISTS "guest_services_villa_idx"
  ON "guest_services" ("villa_id");
CREATE INDEX IF NOT EXISTS "guest_services_status_idx"
  ON "guest_services" ("status");

-- 3) guest_service_options
CREATE TABLE IF NOT EXISTS "guest_service_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id" uuid NOT NULL REFERENCES "guest_services"("id") ON DELETE CASCADE,
  "option_key" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "price_delta_minor" bigint NOT NULL DEFAULT 0,
  "internal_cost_delta_minor" bigint,
  "is_default" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_service_options"
    ADD CONSTRAINT guest_service_options_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "guest_service_options_unique"
  ON "guest_service_options" ("service_id", "option_key")
  WHERE "status" = 'active';

CREATE INDEX IF NOT EXISTS "guest_service_options_service_idx"
  ON "guest_service_options" ("service_id");

-- 4) guest_service_orders
CREATE TABLE IF NOT EXISTS "guest_service_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_code" text NOT NULL UNIQUE,
  "guest_stay_token_id" uuid REFERENCES "guest_stay_tokens"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "service_id" uuid NOT NULL REFERENCES "guest_services"("id") ON DELETE RESTRICT,
  "selected_option_id" uuid REFERENCES "guest_service_options"("id") ON DELETE SET NULL,
  "requested_date" date,
  "requested_time" text,
  "requested_start_at" timestamptz,
  "requested_end_at" timestamptz,
  "quantity" integer NOT NULL DEFAULT 1,
  "guest_count" integer,
  "guest_note" text,
  "internal_note" text,
  "status" text NOT NULL DEFAULT 'requested',
  "guest_price_minor" bigint NOT NULL DEFAULT 0,
  "internal_cost_minor" bigint,
  "margin_minor" bigint,
  "currency" text NOT NULL DEFAULT 'USD',
  "requires_admin_confirmation" boolean NOT NULL DEFAULT true,
  "assigned_to" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "linked_service_request_id" uuid REFERENCES "service_requests"("id") ON DELETE SET NULL,
  "linked_operation_task_id" uuid REFERENCES "operation_tasks"("id") ON DELETE SET NULL,
  "linked_revenue_line_id" uuid REFERENCES "revenue_lines"("id") ON DELETE SET NULL,
  "finance_bridge_status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "confirmed_at" timestamptz,
  "fulfilled_at" timestamptz,
  "cancelled_at" timestamptz
);

DO $$ BEGIN
  ALTER TABLE "guest_service_orders"
    ADD CONSTRAINT guest_service_orders_status_check
    CHECK ("status" IN (
      'requested','reviewing','confirmed','scheduled',
      'fulfilled','cancelled','rejected'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_service_orders"
    ADD CONSTRAINT guest_service_orders_finance_bridge_status_check
    CHECK ("finance_bridge_status" IN (
      'pending','bridged','skipped_no_charge','skipped_locked_period','failed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_service_orders"
    ADD CONSTRAINT guest_service_orders_quantity_check
    CHECK ("quantity" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_service_orders_token_idx"
  ON "guest_service_orders" ("guest_stay_token_id");
CREATE INDEX IF NOT EXISTS "guest_service_orders_booking_idx"
  ON "guest_service_orders" ("booking_id");
CREATE INDEX IF NOT EXISTS "guest_service_orders_villa_idx"
  ON "guest_service_orders" ("villa_id");
CREATE INDEX IF NOT EXISTS "guest_service_orders_service_idx"
  ON "guest_service_orders" ("service_id");
CREATE INDEX IF NOT EXISTS "guest_service_orders_status_idx"
  ON "guest_service_orders" ("status");
CREATE INDEX IF NOT EXISTS "guest_service_orders_finance_bridge_idx"
  ON "guest_service_orders" ("finance_bridge_status");
CREATE INDEX IF NOT EXISTS "guest_service_orders_requested_date_idx"
  ON "guest_service_orders" ("requested_date");

-- 5) guest_service_order_events
CREATE TABLE IF NOT EXISTS "guest_service_order_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "guest_service_orders"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "actor_type" text NOT NULL DEFAULT 'system',
  "actor_app_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "message" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_service_order_events"
    ADD CONSTRAINT guest_service_order_events_event_type_check
    CHECK ("event_type" IN (
      'created','reviewing','confirmed','scheduled','fulfilled',
      'cancelled','rejected','note_added','finance_bridged'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_service_order_events"
    ADD CONSTRAINT guest_service_order_events_actor_type_check
    CHECK ("actor_type" IN ('guest','staff','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_service_order_events_order_idx"
  ON "guest_service_order_events" ("order_id", "created_at" DESC);

-- 6) guest_service_finance_links — idempotency anchor for the bridge.
CREATE TABLE IF NOT EXISTS "guest_service_finance_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "guest_service_orders"("id") ON DELETE CASCADE,
  "revenue_line_id" uuid REFERENCES "revenue_lines"("id") ON DELETE SET NULL,
  "expense_line_id" uuid REFERENCES "expense_lines"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "amount_minor" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'USD',
  "reason" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_service_finance_links"
    ADD CONSTRAINT guest_service_finance_links_status_check
    CHECK ("status" IN (
      'pending','bridged','skipped_no_charge','skipped_locked_period',
      'failed','reversed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "guest_service_finance_links_order_unique"
  ON "guest_service_finance_links" ("order_id");

CREATE INDEX IF NOT EXISTS "guest_service_finance_links_status_idx"
  ON "guest_service_finance_links" ("status");

-- =============================================================================
-- 7) RLS — every new table is internal-only. Guest writes flow through
-- the server route which uses the service-role client; RLS keeps owners
-- and any future code path locked out.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'guest_service_categories',
      'guest_services',
      'guest_service_options',
      'guest_service_orders',
      'guest_service_order_events',
      'guest_service_finance_links'
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

-- Orders + finance links are write-sensitive — explicit internal_write
-- policies on top so any direct admin mutation must go through internal
-- users. The service-role client used by the guest stay-token route
-- bypasses RLS by design.
DROP POLICY IF EXISTS internal_write ON "guest_service_orders";
CREATE POLICY internal_write ON "guest_service_orders"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS internal_write ON "guest_service_finance_links";
CREATE POLICY internal_write ON "guest_service_finance_links"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

COMMIT;
