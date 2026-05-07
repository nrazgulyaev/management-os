-- =============================================================================
-- 0085 — Development OS · Stage 7.B — Subscription plans + feature gating
--
-- 4 new tables — the SaaS commerce backbone:
--   - subscription_plans       plan catalog (Internal, Trial, Basic, Standard,
--                              Pro, Enterprise). Stripe price/product ids
--                              optional; populated by Stage 7.D.
--   - feature_flags            granular feature catalog (cabinet, integration,
--                              ai-agent, limit). Each flag is platform-wide.
--   - plan_features            mapping (plan_code, flag_code) describing which
--                              flags are enabled per plan + numeric limits
--                              (e.g. max villas, max users).
--   - org_subscriptions        per-org active subscription row. Carries
--                              lifecycle state, period markers, Stripe
--                              subscription id, grace + archive timestamps.
--
-- Lifecycle FSM lives on org_subscriptions.status. Stage 7.C cron jobs move
-- rows through the FSM (trial -> active -> grace -> suspended -> archived
-- -> purged). Stage 7.D maps Stripe webhooks into the same FSM transitions.
--
-- RLS: org_subscriptions is per-org. The other 3 tables are platform-wide
-- catalog (no org_id). Authorization for editing the catalog happens at
-- server-action layer (super_admin only).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) subscription_plans
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_code" TEXT NOT NULL UNIQUE,
  "display_name" TEXT NOT NULL,
  "description" TEXT,
  "tier_rank" INTEGER NOT NULL,
  -- Pricing in minor units (cents) — flexible billing currency.
  "monthly_price_minor" BIGINT NOT NULL DEFAULT 0,
  "annual_price_minor" BIGINT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  -- Stripe — populated when 7.D activates.
  "stripe_product_id" TEXT,
  "stripe_monthly_price_id" TEXT,
  "stripe_annual_price_id" TEXT,
  -- Trial.
  "trial_period_days" INTEGER NOT NULL DEFAULT 0,
  -- Lifecycle defaults (overridable per-subscription).
  "default_grace_period_days" INTEGER NOT NULL DEFAULT 3,
  "default_archive_after_days" INTEGER NOT NULL DEFAULT 30,
  "default_purge_after_days" INTEGER NOT NULL DEFAULT 90,
  -- Metadata.
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_internal" BOOLEAN NOT NULL DEFAULT false,
  "is_public" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 100,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "subscription_plans_active_idx"
  ON "subscription_plans"("is_active");
CREATE INDEX IF NOT EXISTS "subscription_plans_tier_idx"
  ON "subscription_plans"("tier_rank");

-- -----------------------------------------------------------------------------
-- 2) feature_flags
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "feature_flags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "flag_code" TEXT NOT NULL UNIQUE,
  "category" TEXT NOT NULL CHECK ("category" IN (
    'cabinet', 'integration', 'ai_agent', 'limit', 'feature'
  )),
  "display_name" TEXT NOT NULL,
  "description" TEXT,
  -- Limit flags carry a numeric quota (e.g., max_villas = 10). Boolean
  -- flags ignore this column.
  "is_numeric_limit" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "feature_flags_category_idx"
  ON "feature_flags"("category");
CREATE INDEX IF NOT EXISTS "feature_flags_active_idx"
  ON "feature_flags"("is_active");

-- -----------------------------------------------------------------------------
-- 3) plan_features
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "plan_features" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_code" TEXT NOT NULL REFERENCES "subscription_plans"("plan_code") ON DELETE CASCADE,
  "flag_code" TEXT NOT NULL REFERENCES "feature_flags"("flag_code") ON DELETE CASCADE,
  -- Boolean flags use is_enabled; numeric limit flags use limit_value.
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "limit_value" BIGINT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("plan_code", "flag_code")
);

CREATE INDEX IF NOT EXISTS "plan_features_plan_idx"
  ON "plan_features"("plan_code");
CREATE INDEX IF NOT EXISTS "plan_features_flag_idx"
  ON "plan_features"("flag_code");

-- -----------------------------------------------------------------------------
-- 4) org_subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "org_subscriptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "plan_code" TEXT NOT NULL REFERENCES "subscription_plans"("plan_code"),
  "billing_cycle" TEXT NOT NULL DEFAULT 'monthly' CHECK ("billing_cycle" IN ('monthly', 'annual')),
  -- Lifecycle FSM — see Stage 7.C.
  "status" TEXT NOT NULL DEFAULT 'trial' CHECK ("status" IN (
    'trial', 'active', 'grace', 'suspended', 'cancelling', 'cancelled',
    'archived', 'purged'
  )),
  -- Period markers (UTC).
  "trial_started_at" TIMESTAMPTZ,
  "trial_ends_at" TIMESTAMPTZ,
  "current_period_starts_at" TIMESTAMPTZ,
  "current_period_ends_at" TIMESTAMPTZ,
  "grace_period_ends_at" TIMESTAMPTZ,
  "suspended_at" TIMESTAMPTZ,
  "cancelled_at" TIMESTAMPTZ,
  "archived_at" TIMESTAMPTZ,
  "purged_at" TIMESTAMPTZ,
  -- Reactivation history.
  "reactivated_at" TIMESTAMPTZ,
  "reactivation_count" INTEGER NOT NULL DEFAULT 0,
  -- Stripe linkage (Stage 7.D).
  "stripe_subscription_id" TEXT,
  "stripe_customer_id" TEXT,
  "stripe_price_id" TEXT,
  -- Internal-comp flag (Arconique-only): bypasses payment + lifecycle.
  "is_internal_comp" BOOLEAN NOT NULL DEFAULT false,
  -- Auto-renewal default.
  "auto_renew" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One active subscription per org. Cancelled/archived rows preserved.
  UNIQUE ("organization_id", "plan_code", "current_period_starts_at")
);

CREATE INDEX IF NOT EXISTS "org_subscriptions_org_idx"
  ON "org_subscriptions"("organization_id");
CREATE INDEX IF NOT EXISTS "org_subscriptions_status_idx"
  ON "org_subscriptions"("status");
CREATE INDEX IF NOT EXISTS "org_subscriptions_stripe_idx"
  ON "org_subscriptions"("stripe_subscription_id")
  WHERE "stripe_subscription_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "org_subscriptions_period_end_idx"
  ON "org_subscriptions"("current_period_ends_at");
CREATE INDEX IF NOT EXISTS "org_subscriptions_grace_end_idx"
  ON "org_subscriptions"("grace_period_ends_at");

-- -----------------------------------------------------------------------------
-- 5) subscription_lifecycle_events (audit log of FSM transitions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "subscription_lifecycle_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "subscription_id" UUID REFERENCES "org_subscriptions"("id") ON DELETE SET NULL,
  "event_type" TEXT NOT NULL CHECK ("event_type" IN (
    'trial_started', 'trial_warned', 'activated', 'renewed',
    'payment_failed', 'entered_grace', 'left_grace', 'suspended',
    'cancellation_requested', 'cancelled', 'archived', 'purged',
    'reactivated', 'plan_changed', 'comp_granted', 'comp_revoked'
  )),
  "from_status" TEXT,
  "to_status" TEXT,
  "actor_user_id" UUID,
  "actor_kind" TEXT NOT NULL DEFAULT 'system' CHECK ("actor_kind" IN (
    'system', 'cron', 'admin', 'self_service', 'stripe_webhook'
  )),
  "payload" JSONB,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "subscription_lifecycle_events_org_idx"
  ON "subscription_lifecycle_events"("organization_id");
CREATE INDEX IF NOT EXISTS "subscription_lifecycle_events_sub_idx"
  ON "subscription_lifecycle_events"("subscription_id");
CREATE INDEX IF NOT EXISTS "subscription_lifecycle_events_event_idx"
  ON "subscription_lifecycle_events"("event_type");
CREATE INDEX IF NOT EXISTS "subscription_lifecycle_events_occurred_idx"
  ON "subscription_lifecycle_events"("occurred_at");

-- -----------------------------------------------------------------------------
-- 6) RLS — org_subscriptions + subscription_lifecycle_events per-org
--    isolation. The catalog tables (plans, flags, plan_features) are
--    platform-wide and editable only by super_admin.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'org_subscriptions',
    'subscription_lifecycle_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS org_isolation ON %I; '
      'CREATE POLICY org_isolation ON %I FOR ALL '
      'USING (public.is_in_user_organization(organization_id)) '
      'WITH CHECK (public.is_in_user_organization(organization_id));',
      t, t
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 7) updated_at triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION subscription_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscription_plans',
    'feature_flags',
    'plan_features',
    'org_subscriptions'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I; '
      'CREATE TRIGGER %I BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION subscription_set_updated_at();',
      t || '_set_updated_at', t,
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 8) Seed plans + a curated subset of feature_flags + plan_features.
-- Idempotent via ON CONFLICT.
-- -----------------------------------------------------------------------------

INSERT INTO "subscription_plans"
  ("plan_code", "display_name", "description", "tier_rank",
   "monthly_price_minor", "annual_price_minor", "trial_period_days",
   "is_internal", "is_public", "sort_order")
VALUES
  ('internal', 'Internal — Arconique',
   'Internal Arconique team plan. Bypasses payment; admin-comp only.',
   0, 0, 0, 0, true, false, 5),
  ('trial', 'Trial',
   '14-day trial with limited cabinets and no integrations.',
   1, 0, 0, 14, false, true, 10),
  ('basic', 'Basic',
   '1 owner cabinet + 2 staff seats; 3 villas; 1 channel integration.',
   2, 9900, 99000, 0, false, true, 20),
  ('standard', 'Standard',
   '5 cabinets; Tier 1+2 AI agents; 10 villas + 3 projects; 3 channels + analytics.',
   3, 29900, 299000, 0, false, true, 30),
  ('pro', 'Pro',
   'All cabinets; full AI suite; 25 villas + 10 projects; all integrations.',
   4, 59900, 599000, 0, false, true, 40),
  ('enterprise', 'Enterprise',
   'Custom — unlimited usage, dedicated AI quotas, SSO. Contact sales.',
   5, 0, 0, 0, false, true, 50)
ON CONFLICT ("plan_code") DO NOTHING;

INSERT INTO "feature_flags"
  ("flag_code", "category", "display_name", "description", "is_numeric_limit")
VALUES
  -- Cabinet flags.
  ('cabinet.owner', 'cabinet', 'Owner Cabinet', 'Owner-user landing.', false),
  ('cabinet.cfo_accountant', 'cabinet', 'CFO / Accountant Cabinet', '', false),
  ('cabinet.project_manager', 'cabinet', 'Project Manager Cabinet', '', false),
  ('cabinet.site_supervisor', 'cabinet', 'Site Supervisor Cabinet', '', false),
  ('cabinet.qs', 'cabinet', 'QS Cabinet', '', false),
  ('cabinet.procurement_manager', 'cabinet', 'Procurement Cabinet', '', false),
  ('cabinet.warehouse_manager', 'cabinet', 'Warehouse Cabinet', '', false),
  ('cabinet.marketing_staff', 'cabinet', 'Marketing Cabinet', '', false),
  ('cabinet.sales_manager', 'cabinet', 'Sales Cabinet', '', false),
  -- Integration flags.
  ('integration.booking_com', 'integration', 'Booking.com', '', false),
  ('integration.airbnb', 'integration', 'Airbnb', '', false),
  ('integration.stripe', 'integration', 'Stripe', '', false),
  ('integration.google_workspace', 'integration', 'Google Workspace', '', false),
  ('integration.meta_ads', 'integration', 'Meta Ads', '', false),
  ('integration.google_ads', 'integration', 'Google Ads', '', false),
  -- AI agent flags.
  ('ai.agents_basic', 'ai_agent', 'Tier 1+2 AI Agents', '', false),
  ('ai.agents_full', 'ai_agent', 'All AI Agents', '', false),
  ('ai.dedicated_quota', 'ai_agent', 'Dedicated AI Quota', '', false),
  -- Feature flags.
  ('feature.investor_portal', 'feature', 'Investor Portal', '', false),
  ('feature.custom_reports', 'feature', 'Custom Reports', '', false),
  ('feature.api_access', 'feature', 'Public API access', '', false),
  ('feature.sso', 'feature', 'Single Sign-On', '', false),
  -- Numeric limits.
  ('limit.villa_count', 'limit', 'Max villas', '', true),
  ('limit.project_count', 'limit', 'Max projects', '', true),
  ('limit.user_seats', 'limit', 'Max user seats', '', true),
  ('limit.ai_monthly_usd', 'limit', 'AI monthly USD cap', '', true)
ON CONFLICT ("flag_code") DO NOTHING;

-- Plan-feature mappings — start with core gates.
INSERT INTO "plan_features" ("plan_code", "flag_code", "is_enabled", "limit_value")
VALUES
  -- Internal: everything on, no limits.
  ('internal', 'cabinet.owner', true, NULL),
  ('internal', 'cabinet.cfo_accountant', true, NULL),
  ('internal', 'cabinet.project_manager', true, NULL),
  ('internal', 'cabinet.site_supervisor', true, NULL),
  ('internal', 'cabinet.qs', true, NULL),
  ('internal', 'cabinet.procurement_manager', true, NULL),
  ('internal', 'cabinet.warehouse_manager', true, NULL),
  ('internal', 'cabinet.marketing_staff', true, NULL),
  ('internal', 'cabinet.sales_manager', true, NULL),
  ('internal', 'ai.agents_full', true, NULL),
  ('internal', 'ai.dedicated_quota', true, NULL),
  ('internal', 'feature.investor_portal', true, NULL),
  ('internal', 'feature.custom_reports', true, NULL),
  ('internal', 'feature.api_access', true, NULL),
  ('internal', 'feature.sso', true, NULL),
  ('internal', 'limit.ai_monthly_usd', true, 50000),

  -- Trial: 1 villa, 1 project, owner cabinet only.
  ('trial', 'cabinet.owner', true, NULL),
  ('trial', 'limit.villa_count', true, 1),
  ('trial', 'limit.project_count', true, 1),
  ('trial', 'limit.user_seats', true, 2),

  -- Basic: 3 villas, owner + sales, 1 channel.
  ('basic', 'cabinet.owner', true, NULL),
  ('basic', 'cabinet.sales_manager', true, NULL),
  ('basic', 'integration.booking_com', true, NULL),
  ('basic', 'limit.villa_count', true, 3),
  ('basic', 'limit.project_count', true, 1),
  ('basic', 'limit.user_seats', true, 5),

  -- Standard: 5 cabinets, Tier 1+2 AI.
  ('standard', 'cabinet.owner', true, NULL),
  ('standard', 'cabinet.cfo_accountant', true, NULL),
  ('standard', 'cabinet.project_manager', true, NULL),
  ('standard', 'cabinet.marketing_staff', true, NULL),
  ('standard', 'cabinet.sales_manager', true, NULL),
  ('standard', 'integration.booking_com', true, NULL),
  ('standard', 'integration.airbnb', true, NULL),
  ('standard', 'integration.stripe', true, NULL),
  ('standard', 'integration.google_workspace', true, NULL),
  ('standard', 'ai.agents_basic', true, NULL),
  ('standard', 'feature.api_access', true, NULL),
  ('standard', 'limit.villa_count', true, 10),
  ('standard', 'limit.project_count', true, 3),
  ('standard', 'limit.user_seats', true, 15),
  ('standard', 'limit.ai_monthly_usd', true, 500),

  -- Pro: all cabinets, full AI, all integrations.
  ('pro', 'cabinet.owner', true, NULL),
  ('pro', 'cabinet.cfo_accountant', true, NULL),
  ('pro', 'cabinet.project_manager', true, NULL),
  ('pro', 'cabinet.site_supervisor', true, NULL),
  ('pro', 'cabinet.qs', true, NULL),
  ('pro', 'cabinet.procurement_manager', true, NULL),
  ('pro', 'cabinet.warehouse_manager', true, NULL),
  ('pro', 'cabinet.marketing_staff', true, NULL),
  ('pro', 'cabinet.sales_manager', true, NULL),
  ('pro', 'integration.booking_com', true, NULL),
  ('pro', 'integration.airbnb', true, NULL),
  ('pro', 'integration.stripe', true, NULL),
  ('pro', 'integration.google_workspace', true, NULL),
  ('pro', 'integration.meta_ads', true, NULL),
  ('pro', 'integration.google_ads', true, NULL),
  ('pro', 'ai.agents_full', true, NULL),
  ('pro', 'feature.investor_portal', true, NULL),
  ('pro', 'feature.custom_reports', true, NULL),
  ('pro', 'feature.api_access', true, NULL),
  ('pro', 'limit.villa_count', true, 25),
  ('pro', 'limit.project_count', true, 10),
  ('pro', 'limit.user_seats', true, 50),
  ('pro', 'limit.ai_monthly_usd', true, 2500),

  -- Enterprise: like Pro + SSO + dedicated quota.
  ('enterprise', 'cabinet.owner', true, NULL),
  ('enterprise', 'cabinet.cfo_accountant', true, NULL),
  ('enterprise', 'cabinet.project_manager', true, NULL),
  ('enterprise', 'cabinet.site_supervisor', true, NULL),
  ('enterprise', 'cabinet.qs', true, NULL),
  ('enterprise', 'cabinet.procurement_manager', true, NULL),
  ('enterprise', 'cabinet.warehouse_manager', true, NULL),
  ('enterprise', 'cabinet.marketing_staff', true, NULL),
  ('enterprise', 'cabinet.sales_manager', true, NULL),
  ('enterprise', 'integration.booking_com', true, NULL),
  ('enterprise', 'integration.airbnb', true, NULL),
  ('enterprise', 'integration.stripe', true, NULL),
  ('enterprise', 'integration.google_workspace', true, NULL),
  ('enterprise', 'integration.meta_ads', true, NULL),
  ('enterprise', 'integration.google_ads', true, NULL),
  ('enterprise', 'ai.agents_full', true, NULL),
  ('enterprise', 'ai.dedicated_quota', true, NULL),
  ('enterprise', 'feature.investor_portal', true, NULL),
  ('enterprise', 'feature.custom_reports', true, NULL),
  ('enterprise', 'feature.api_access', true, NULL),
  ('enterprise', 'feature.sso', true, NULL)
ON CONFLICT ("plan_code", "flag_code") DO NOTHING;

COMMIT;
