-- =============================================================================
-- 0012 — Owner stays, relocation candidates, equivalence groups, rate plans (v9B).
--
-- Builds on V9A's `villa_calendar_blocks` — approved owner stays materialise
-- as `block_type='owner_stay'` rows. Adds basic pricing primitives so we can
-- estimate the revenue impact of an owner stay (and feed future direct-booking
-- + dynamic-pricing flows). NO bank reconciliation, NO PriceLabs, NO payments.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) owner_stay_policies — per project / villa policy: free nights, blackout,
--    approval rules, compensation model.
CREATE TABLE IF NOT EXISTS "owner_stay_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "policy_name" text NOT NULL,
  "free_nights_per_year" integer NOT NULL DEFAULT 14,
  "free_nights_apply_to_peak" boolean NOT NULL DEFAULT false,
  "requires_approval" boolean NOT NULL DEFAULT true,
  "allow_displacing_guest_bookings" boolean NOT NULL DEFAULT false,
  "relocation_allowed" boolean NOT NULL DEFAULT true,
  "operational_cost_model" text NOT NULL DEFAULT 'actual_costs',
  "fixed_operational_cost_minor" bigint,
  "currency" text,
  "compensation_model" text NOT NULL DEFAULT 'management_fee_on_expected_gross',
  "compensation_percent" numeric,
  "fixed_compensation_minor" bigint,
  "blackout_dates" jsonb,
  "peak_season_rules" jsonb,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "owner_stay_policies"
    ADD CONSTRAINT owner_stay_policies_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "owner_stay_policies"
    ADD CONSTRAINT owner_stay_policies_op_cost_model_check
    CHECK ("operational_cost_model" IN ('none','actual_costs','fixed_per_stay','fixed_per_night'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "owner_stay_policies"
    ADD CONSTRAINT owner_stay_policies_comp_model_check
    CHECK ("compensation_model" IN ('none','fixed_per_night','management_fee_on_expected_gross','percent_of_expected_gross'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "owner_stay_policies_villa_idx"
  ON "owner_stay_policies" ("villa_id");
CREATE INDEX IF NOT EXISTS "owner_stay_policies_project_idx"
  ON "owner_stay_policies" ("project_id");
CREATE INDEX IF NOT EXISTS "owner_stay_policies_status_idx"
  ON "owner_stay_policies" ("status");

-- 2) owner_stay_requests — owner-portal-facing request, with admin lifecycle
--    and the estimate snapshot at request time.
CREATE TABLE IF NOT EXISTS "owner_stay_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "requested_by_app_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "requested_start" date NOT NULL,
  "requested_end" date NOT NULL,
  "guests_count" integer,
  "purpose" text,
  "status" text NOT NULL DEFAULT 'requested',
  "admin_decision" text,
  "admin_notes" text,
  "estimated_gross_revenue_minor" bigint NOT NULL DEFAULT 0,
  "estimated_management_compensation_minor" bigint NOT NULL DEFAULT 0,
  "estimated_operational_cost_minor" bigint NOT NULL DEFAULT 0,
  "estimated_total_owner_charge_minor" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'USD',
  "allowance_year" integer,
  "allowance_nights_applied" integer NOT NULL DEFAULT 0,
  "billable_nights" integer NOT NULL DEFAULT 0,
  "relocation_required" boolean NOT NULL DEFAULT false,
  "relocation_possible" boolean,
  "approved_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "rejected_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "rejected_at" timestamptz,
  "created_calendar_block_id" uuid REFERENCES "villa_calendar_blocks"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "owner_stay_requests"
    ADD CONSTRAINT owner_stay_requests_status_check
    CHECK ("status" IN (
      'requested','availability_check','requires_relocation',
      'pending_admin_approval','approved','rejected','cancelled','completed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "owner_stay_requests"
    ADD CONSTRAINT owner_stay_requests_dates_check
    CHECK ("requested_end" > "requested_start");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "owner_stay_requests_owner_idx"
  ON "owner_stay_requests" ("owner_id");
CREATE INDEX IF NOT EXISTS "owner_stay_requests_villa_idx"
  ON "owner_stay_requests" ("villa_id", "requested_start");
CREATE INDEX IF NOT EXISTS "owner_stay_requests_status_idx"
  ON "owner_stay_requests" ("status");
CREATE INDEX IF NOT EXISTS "owner_stay_requests_year_idx"
  ON "owner_stay_requests" ("owner_id", "allowance_year");

-- 3) villa_equivalence_groups — "swap-comparable" villas for relocation.
CREATE TABLE IF NOT EXISTS "villa_equivalence_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "villa_equivalence_groups"
    ADD CONSTRAINT villa_equivalence_groups_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "villa_equivalence_groups_project_idx"
  ON "villa_equivalence_groups" ("project_id");

-- 4) villa_equivalence_group_members — the membership table.
CREATE TABLE IF NOT EXISTS "villa_equivalence_group_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "villa_equivalence_groups"("id") ON DELETE CASCADE,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "quality_rank" integer NOT NULL DEFAULT 100,
  "notes" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "villa_equivalence_group_members"
    ADD CONSTRAINT villa_equivalence_group_members_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "villa_equivalence_group_members_unique"
  ON "villa_equivalence_group_members" ("group_id", "villa_id");
CREATE INDEX IF NOT EXISTS "villa_equivalence_group_members_villa_idx"
  ON "villa_equivalence_group_members" ("villa_id");

-- 5) booking_relocation_candidates — proposed swaps surfaced to admin.
CREATE TABLE IF NOT EXISTS "booking_relocation_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_stay_request_id" uuid NOT NULL REFERENCES "owner_stay_requests"("id") ON DELETE CASCADE,
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "from_villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "to_villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "candidate_status" text NOT NULL DEFAULT 'candidate',
  "score" numeric NOT NULL DEFAULT 0,
  "guest_impact_level" text NOT NULL DEFAULT 'low',
  "reason" text,
  "revenue_difference_minor" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'USD',
  "requires_guest_notification" boolean NOT NULL DEFAULT true,
  "approved_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "applied_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "booking_relocation_candidates"
    ADD CONSTRAINT booking_relocation_candidates_status_check
    CHECK ("candidate_status" IN ('candidate','approved','rejected','applied','expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "booking_relocation_candidates"
    ADD CONSTRAINT booking_relocation_candidates_impact_check
    CHECK ("guest_impact_level" IN ('none','low','medium','high'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "booking_relocation_candidates_request_idx"
  ON "booking_relocation_candidates" ("owner_stay_request_id");
CREATE INDEX IF NOT EXISTS "booking_relocation_candidates_booking_idx"
  ON "booking_relocation_candidates" ("booking_id");
CREATE INDEX IF NOT EXISTS "booking_relocation_candidates_status_idx"
  ON "booking_relocation_candidates" ("candidate_status");

-- 6) rate_plans — per-villa or per-project base nightly rate + currency.
CREATE TABLE IF NOT EXISTS "rate_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "base_currency" text NOT NULL DEFAULT 'USD',
  "base_nightly_rate_minor" bigint NOT NULL DEFAULT 0,
  "management_fee_percent" numeric,
  "status" text NOT NULL DEFAULT 'active',
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "rate_plans"
    ADD CONSTRAINT rate_plans_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "rate_plans_villa_idx" ON "rate_plans" ("villa_id");
CREATE INDEX IF NOT EXISTS "rate_plans_project_idx" ON "rate_plans" ("project_id");
CREATE INDEX IF NOT EXISTS "rate_plans_status_idx" ON "rate_plans" ("status");

-- 7) rate_plan_seasons — date-range multipliers / fixed rates / MLOS / stop-sell.
CREATE TABLE IF NOT EXISTS "rate_plan_seasons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rate_plan_id" uuid NOT NULL REFERENCES "rate_plans"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "multiplier" numeric NOT NULL DEFAULT 1,
  "nightly_rate_minor" bigint,
  "min_los" integer,
  "max_los" integer,
  "stop_sell" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "rate_plan_seasons"
    ADD CONSTRAINT rate_plan_seasons_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rate_plan_seasons"
    ADD CONSTRAINT rate_plan_seasons_dates_check
    CHECK ("ends_on" >= "starts_on");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "rate_plan_seasons_plan_idx"
  ON "rate_plan_seasons" ("rate_plan_id", "starts_on");
CREATE INDEX IF NOT EXISTS "rate_plan_seasons_status_idx"
  ON "rate_plan_seasons" ("status");

-- 8) rate_plan_overrides — per-night manual override or future PriceLabs push.
CREATE TABLE IF NOT EXISTS "rate_plan_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rate_plan_id" uuid NOT NULL REFERENCES "rate_plans"("id") ON DELETE CASCADE,
  "stay_date" date NOT NULL,
  "nightly_rate_minor" bigint,
  "min_los" integer,
  "stop_sell" boolean NOT NULL DEFAULT false,
  "source" text NOT NULL DEFAULT 'manual',
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "rate_plan_overrides"
    ADD CONSTRAINT rate_plan_overrides_source_check
    CHECK ("source" IN ('manual','pricelabs','channel','import'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "rate_plan_overrides_unique"
  ON "rate_plan_overrides" ("rate_plan_id", "stay_date");

-- 9) RLS — every new table is internal-read by default. Owner stay requests
--    additionally allow owners to read + insert their own rows. Relocation
--    candidates and rate-plan internals stay internal-only — owners reach
--    rates only through the safe quote service.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'owner_stay_policies',
      'owner_stay_requests',
      'villa_equivalence_groups',
      'villa_equivalence_group_members',
      'booking_relocation_candidates',
      'rate_plans',
      'rate_plan_seasons',
      'rate_plan_overrides'
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

-- Owner self-read on owner_stay_requests via current_owner_ids().
DROP POLICY IF EXISTS owner_self_read ON "owner_stay_requests";
CREATE POLICY owner_self_read ON "owner_stay_requests"
  FOR SELECT
  USING ("owner_id" IN (SELECT public.current_owner_ids()));

-- Owner self-insert: the row must target an owner_id the user has been
-- granted, and the status must start at 'requested'. Admin transitions
-- happen through service-role / authenticated internal users.
DROP POLICY IF EXISTS owner_self_insert ON "owner_stay_requests";
CREATE POLICY owner_self_insert ON "owner_stay_requests"
  FOR INSERT
  WITH CHECK (
    "owner_id" IN (SELECT public.current_owner_ids())
    AND "status" = 'requested'
  );

-- Owner self-cancel: limited update — owner can only set status to
-- 'cancelled' on their own row that is still 'requested' or
-- 'pending_admin_approval'. All other updates require internal_user.
DROP POLICY IF EXISTS owner_self_cancel ON "owner_stay_requests";
CREATE POLICY owner_self_cancel ON "owner_stay_requests"
  FOR UPDATE
  USING (
    "owner_id" IN (SELECT public.current_owner_ids())
    AND "status" IN ('requested','pending_admin_approval','availability_check','requires_relocation')
  )
  WITH CHECK (
    "owner_id" IN (SELECT public.current_owner_ids())
    AND "status" = 'cancelled'
  );

-- Internal full-access policy on owner_stay_requests for everything else.
DROP POLICY IF EXISTS internal_write ON "owner_stay_requests";
CREATE POLICY internal_write ON "owner_stay_requests"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

COMMIT;
