-- =============================================================================
-- 0096 — Sprint 3b · plan_packaging (marketing-tier ↔ Stripe-product mapping)
--
-- The Stage 7.B `subscription_plans` table is the gating source of truth
-- (cabinets, integrations, AI agents, limits via `plan_features`). One
-- plan_code (e.g. `standard`) corresponds to three customer-facing
-- "packagings" via Sprint 3a marketing:
--
--   plan_code: standard   →   bundle-pro          ($499 / mo)
--                         →   mgmt-only-pro       ($199 / mo)
--                         →   dev-only-pro        ($349 / mo)
--
-- Each packaging gets its own Stripe Product + two Prices (monthly +
-- annual @ -15%). This table is the join.
--
-- Operator decision (2026-05-13, "Option C / hybrid"):
--   - Don't bloat the DB seed to one row per packaging — the gating
--     model stays plan-code-centric.
--   - Don't squash three packagings into one Stripe price — annual
--     savings + Bundle arbitrage are real money.
--   - Stripe webhooks + checkout sessions carry the packaging_key in
--     `metadata`; the bridge (`stripe-subscription-bridge.ts`) reads
--     it to set `org_subscriptions.plan_code` AND
--     `organizations.products_enabled` atomically.
--
-- Schema:
--   packaging_key            stable id (mgmt-only-pro, bundle-scale, …)
--   plan_kind                'management-only' | 'development-only' | 'bundle'
--   tier_key                 'starter' | 'pro' | 'scale' | 'enterprise'
--   plan_code                FK → subscription_plans.plan_code
--   products_enabled         text[] of ProductSlug values ('mgmt'|'dev')
--   monthly_price_minor      USD cents, 0 for enterprise (custom)
--   annual_price_minor       USD cents, 0 for enterprise
--   stripe_product_id        populated by Sprint 3b provisioning script
--   stripe_monthly_price_id  populated by Sprint 3b provisioning script
--   stripe_annual_price_id   populated by Sprint 3b provisioning script
--   is_public                whether to surface on /pricing
--   is_active                soft-delete flag
--
-- Catalog table (platform-wide, no org_id) — same RLS posture as
-- subscription_plans / feature_flags. Catalog writes happen via
-- super_admin-gated server actions; reads are unrestricted.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "plan_packaging" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "packaging_key" TEXT NOT NULL UNIQUE,
  "plan_kind" TEXT NOT NULL CHECK ("plan_kind" IN (
    'management-only', 'development-only', 'bundle'
  )),
  "tier_key" TEXT NOT NULL CHECK ("tier_key" IN (
    'starter', 'pro', 'scale', 'enterprise'
  )),
  "plan_code" TEXT NOT NULL REFERENCES "subscription_plans"("plan_code") ON DELETE RESTRICT,
  -- Postgres text[] mirrors organizations.products_enabled. Values
  -- constrained at the application layer (ProductSlug enum); SQL CHECK
  -- left permissive so adding a third product later is a one-line
  -- change, not a migration.
  "products_enabled" TEXT[] NOT NULL,
  "monthly_price_minor" BIGINT NOT NULL DEFAULT 0,
  "annual_price_minor" BIGINT NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  -- Stripe linkage (populated by scripts/stripe-provision.ts).
  "stripe_product_id" TEXT,
  "stripe_monthly_price_id" TEXT,
  "stripe_annual_price_id" TEXT,
  "stripe_provisioned_at" TIMESTAMPTZ,
  -- Catalog flags.
  "is_public" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 100,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same (plan_kind, tier_key) pair must be unique — the packaging_key
  -- column is its derived stable id but enforcing here is cheap.
  UNIQUE ("plan_kind", "tier_key")
);

CREATE INDEX IF NOT EXISTS "plan_packaging_plan_code_idx"
  ON "plan_packaging"("plan_code");
CREATE INDEX IF NOT EXISTS "plan_packaging_active_idx"
  ON "plan_packaging"("is_active") WHERE "is_active" = true;
CREATE INDEX IF NOT EXISTS "plan_packaging_public_idx"
  ON "plan_packaging"("is_public") WHERE "is_public" = true;

-- -----------------------------------------------------------------------------
-- Seed — 12 rows mirroring src/lib/marketing/pricing-tiers.ts.
--
-- Prices match the operator-approved Sprint 3a tiers (4-tier × 3-plan
-- model). Annual = round(monthly × 12 × 0.85), encoded explicitly so a
-- DB-only inspection matches the marketing surface without running
-- application code.
--
-- Stripe IDs left NULL — populated by scripts/stripe-provision.ts.
-- -----------------------------------------------------------------------------

INSERT INTO "plan_packaging"
  ("packaging_key", "plan_kind", "tier_key", "plan_code",
   "products_enabled", "monthly_price_minor", "annual_price_minor",
   "is_public", "is_active", "sort_order")
VALUES
  -- Management only
  ('mgmt-only-starter', 'management-only', 'starter', 'basic',
   ARRAY['mgmt'], 7900, 80580, true, true, 110),
  ('mgmt-only-pro', 'management-only', 'pro', 'standard',
   ARRAY['mgmt'], 19900, 202980, true, true, 120),
  ('mgmt-only-scale', 'management-only', 'scale', 'pro',
   ARRAY['mgmt'], 49900, 508980, true, true, 130),
  ('mgmt-only-enterprise', 'management-only', 'enterprise', 'enterprise',
   ARRAY['mgmt'], 0, 0, true, true, 140),

  -- Development only
  ('dev-only-starter', 'development-only', 'starter', 'basic',
   ARRAY['dev'], 14900, 151980, true, true, 210),
  ('dev-only-pro', 'development-only', 'pro', 'standard',
   ARRAY['dev'], 34900, 355980, true, true, 220),
  ('dev-only-scale', 'development-only', 'scale', 'pro',
   ARRAY['dev'], 79900, 814980, true, true, 230),
  ('dev-only-enterprise', 'development-only', 'enterprise', 'enterprise',
   ARRAY['dev'], 0, 0, true, true, 240),

  -- Bundle
  ('bundle-starter', 'bundle', 'starter', 'basic',
   ARRAY['mgmt', 'dev'], 19900, 202980, true, true, 310),
  ('bundle-pro', 'bundle', 'pro', 'standard',
   ARRAY['mgmt', 'dev'], 49900, 508980, true, true, 320),
  ('bundle-scale', 'bundle', 'scale', 'pro',
   ARRAY['mgmt', 'dev'], 119900, 1222980, true, true, 330),
  ('bundle-enterprise', 'bundle', 'enterprise', 'enterprise',
   ARRAY['mgmt', 'dev'], 0, 0, true, true, 340)
ON CONFLICT ("packaging_key") DO NOTHING;

COMMIT;
