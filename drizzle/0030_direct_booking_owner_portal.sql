-- =============================================================================
-- Prompt 108 — Direct Booking Owner Portal Surface + Owner Revenue Transparency.
--
-- Three new owner-facing projection tables. Owners read these instead of the
-- raw direct_booking_*, revenue_lines, or booking_channels tables — that is
-- the whole point: the projection is the seam where redaction happens.
--
--   owner_booking_summaries        — owner-safe per-booking row
--   owner_booking_revenue_breakdowns — owner-safe per-booking revenue line items
--   owner_revenue_source_monthly   — precomputed monthly source mix
--
-- All three are RLS forced internal-only for write; owners read via
-- public.current_owner_ids() join through ownership_shares is implicit because
-- the projection rows already carry an owner_id and a villa_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) owner_booking_summaries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "owner_booking_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "direct_booking_request_id" uuid REFERENCES "direct_booking_requests"("id")
    ON DELETE SET NULL,
  "direct_booking_hold_id" uuid REFERENCES "direct_booking_holds"("id")
    ON DELETE SET NULL,
  "source_type" text NOT NULL,
  "public_status" text NOT NULL,
  "owner_label" text NOT NULL,
  "guest_label" text,
  "guest_country" text,
  "channel_label" text,
  "check_in" date NOT NULL,
  "check_out" date NOT NULL,
  "nights" integer NOT NULL,
  "guest_count" integer,
  "total_amount_minor" bigint,
  "owner_revenue_minor" bigint,
  "currency" text,
  "revenue_posted" boolean NOT NULL DEFAULT false,
  "statement_id" uuid REFERENCES "owner_statements"("id") ON DELETE SET NULL,
  "statement_line_id" uuid REFERENCES "statement_lines"("id") ON DELETE SET NULL,
  "owner_visible" boolean NOT NULL DEFAULT true,
  "visibility_notes" text,
  "source_updated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "owner_booking_summaries"
    ADD CONSTRAINT owner_booking_summaries_source_check
    CHECK ("source_type" IN (
      'direct_booking', 'ota_airbnb', 'ota_booking_com', 'ota_vrbo',
      'manual', 'owner_stay', 'maintenance_block', 'internal_hold',
      'service_related', 'other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "owner_booking_summaries"
    ADD CONSTRAINT owner_booking_summaries_status_check
    CHECK ("public_status" IN (
      'inquiry', 'under_review', 'deposit_pending', 'confirmed',
      'in_house', 'completed', 'cancelled', 'expired',
      'blocked', 'maintenance', 'owner_stay'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "owner_booking_summaries_owner_check_in_idx"
  ON "owner_booking_summaries" ("owner_id", "check_in" DESC);
CREATE INDEX IF NOT EXISTS "owner_booking_summaries_villa_check_in_idx"
  ON "owner_booking_summaries" ("villa_id", "check_in" DESC);
CREATE INDEX IF NOT EXISTS "owner_booking_summaries_booking_idx"
  ON "owner_booking_summaries" ("booking_id");
CREATE INDEX IF NOT EXISTS "owner_booking_summaries_request_idx"
  ON "owner_booking_summaries" ("direct_booking_request_id");
CREATE INDEX IF NOT EXISTS "owner_booking_summaries_statement_idx"
  ON "owner_booking_summaries" ("statement_id");
CREATE INDEX IF NOT EXISTS "owner_booking_summaries_source_idx"
  ON "owner_booking_summaries" ("source_type");
CREATE INDEX IF NOT EXISTS "owner_booking_summaries_status_idx"
  ON "owner_booking_summaries" ("public_status");

-- Idempotency: at most one summary per booking, at most one per request.
CREATE UNIQUE INDEX IF NOT EXISTS "owner_booking_summaries_booking_unique"
  ON "owner_booking_summaries" ("owner_id", "booking_id")
  WHERE "booking_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "owner_booking_summaries_request_unique"
  ON "owner_booking_summaries" ("owner_id", "direct_booking_request_id")
  WHERE "direct_booking_request_id" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) owner_booking_revenue_breakdowns
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "owner_booking_revenue_breakdowns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_booking_summary_id" uuid NOT NULL
    REFERENCES "owner_booking_summaries"("id") ON DELETE CASCADE,
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "direct_booking_request_id" uuid REFERENCES "direct_booking_requests"("id")
    ON DELETE SET NULL,
  "category" text NOT NULL,
  "label" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "direction" text NOT NULL,
  "owner_visible" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "owner_booking_revenue_breakdowns"
    ADD CONSTRAINT owner_booking_revenue_breakdowns_category_check
    CHECK ("category" IN (
      'accommodation', 'cleaning_fee', 'service_revenue', 'taxes',
      'ota_fee', 'payment_fee', 'management_fee', 'reserve',
      'owner_payout_effect', 'other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "owner_booking_revenue_breakdowns"
    ADD CONSTRAINT owner_booking_revenue_breakdowns_direction_check
    CHECK ("direction" IN ('revenue', 'deduction', 'neutral'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "owner_booking_revenue_breakdowns_summary_sort_idx"
  ON "owner_booking_revenue_breakdowns"
  ("owner_booking_summary_id", "sort_order");
CREATE INDEX IF NOT EXISTS "owner_booking_revenue_breakdowns_owner_idx"
  ON "owner_booking_revenue_breakdowns" ("owner_id");
CREATE INDEX IF NOT EXISTS "owner_booking_revenue_breakdowns_villa_idx"
  ON "owner_booking_revenue_breakdowns" ("villa_id");
CREATE INDEX IF NOT EXISTS "owner_booking_revenue_breakdowns_booking_idx"
  ON "owner_booking_revenue_breakdowns" ("booking_id");
CREATE INDEX IF NOT EXISTS "owner_booking_revenue_breakdowns_request_idx"
  ON "owner_booking_revenue_breakdowns" ("direct_booking_request_id");

-- -----------------------------------------------------------------------------
-- 3) owner_revenue_source_monthly
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "owner_revenue_source_monthly" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "period_month" date NOT NULL,
  "source_type" text NOT NULL,
  "gross_revenue_minor" bigint NOT NULL DEFAULT 0,
  "deductions_minor" bigint NOT NULL DEFAULT 0,
  "net_owner_effect_minor" bigint NOT NULL DEFAULT 0,
  "booking_count" integer NOT NULL DEFAULT 0,
  "occupied_nights" integer NOT NULL DEFAULT 0,
  "currency" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "owner_revenue_source_monthly"
    ADD CONSTRAINT owner_revenue_source_monthly_source_check
    CHECK ("source_type" IN (
      'direct_booking', 'ota', 'owner_stay', 'service_upsell',
      'manual', 'other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "owner_revenue_source_monthly_owner_period_idx"
  ON "owner_revenue_source_monthly" ("owner_id", "period_month" DESC);
CREATE INDEX IF NOT EXISTS "owner_revenue_source_monthly_villa_period_idx"
  ON "owner_revenue_source_monthly" ("villa_id", "period_month" DESC);
CREATE INDEX IF NOT EXISTS "owner_revenue_source_monthly_source_idx"
  ON "owner_revenue_source_monthly" ("source_type");

-- The owner/villa/project/period/source/currency tuple is the bucket
-- key. We use COALESCE so the partial NULL-handling is consistent
-- with how we INSERT (... ON CONFLICT DO UPDATE ...) below.
CREATE UNIQUE INDEX IF NOT EXISTS "owner_revenue_source_monthly_unique"
  ON "owner_revenue_source_monthly" (
    "owner_id",
    COALESCE("villa_id", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("project_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "period_month",
    "source_type",
    "currency"
  );

-- =============================================================================
-- RLS — internal write, owner self-read.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'owner_booking_summaries',
      'owner_booking_revenue_breakdowns',
      'owner_revenue_source_monthly'
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

-- Owner self-read on the projection.  Owner can only see rows whose
-- owner_id is among the owners they have access to AND whose owner_visible
-- flag is true.  No owner write policies — every mutation goes through
-- internal services.
DROP POLICY IF EXISTS owner_self_read ON "owner_booking_summaries";
CREATE POLICY owner_self_read ON "owner_booking_summaries"
  FOR SELECT
  USING (
    "owner_visible" = true
    AND "owner_id" IN (SELECT public.current_owner_ids())
  );

DROP POLICY IF EXISTS owner_self_read ON "owner_booking_revenue_breakdowns";
CREATE POLICY owner_self_read ON "owner_booking_revenue_breakdowns"
  FOR SELECT
  USING (
    "owner_visible" = true
    AND "owner_id" IN (SELECT public.current_owner_ids())
  );

DROP POLICY IF EXISTS owner_self_read ON "owner_revenue_source_monthly";
CREATE POLICY owner_self_read ON "owner_revenue_source_monthly"
  FOR SELECT
  USING (
    "owner_id" IN (SELECT public.current_owner_ids())
  );
