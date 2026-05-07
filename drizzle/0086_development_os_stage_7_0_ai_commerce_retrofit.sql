-- =============================================================================
-- 0086 — Development OS · Stage 7.0 — AI commerce retrofit (additive)
--
-- Path C of Stage 7.0 reconciliation. Phase A.2 (migration 0083) and Stage 7.B
-- (migration 0085) already shipped the org-quota + subscription-plan
-- infrastructure. This migration adds only the genuinely-missing pieces:
--
--   1. `subscription_plans.markup_percent`  — % markup over actual API cost
--   2. `subscription_plans.max_tier`        — 1/2/3 tier ceiling for agents
--   3. `subscription_plans.enabled_agent_codes` — allowlist (empty = all)
--   4. `ai_org_usage_monthly.by_agent`      — JSONB breakdown per agent code
--   5. `ai_org_usage_monthly.by_provider`   — JSONB breakdown per provider
--   6. `ai_org_usage_monthly.by_tier`       — JSONB breakdown per tier
--
-- All ALTER TABLE statements are idempotent (`ADD COLUMN IF NOT EXISTS`).
-- Plan-code seed updates wrapped in FOREACH IN ARRAY (7th preservation of
-- the 0075 lesson).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Extend subscription_plans (Stage 7.B, migration 0085) with AI-routing
--    columns. Generic plan stays generic — these columns are AI-specific
--    metadata that the router consults.
-- -----------------------------------------------------------------------------

ALTER TABLE "subscription_plans"
  ADD COLUMN IF NOT EXISTS "markup_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_tier" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "enabled_agent_codes" TEXT[]
    NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Sanity constraints — keep markup non-negative + tier in 1..3.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'subscription_plans'
      AND constraint_name = 'subscription_plans_markup_nonnegative'
  ) THEN
    ALTER TABLE "subscription_plans"
      ADD CONSTRAINT "subscription_plans_markup_nonnegative"
      CHECK ("markup_percent" >= 0 AND "markup_percent" <= 1000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'subscription_plans'
      AND constraint_name = 'subscription_plans_max_tier_range'
  ) THEN
    ALTER TABLE "subscription_plans"
      ADD CONSTRAINT "subscription_plans_max_tier_range"
      CHECK ("max_tier" BETWEEN 1 AND 3);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Extend ai_org_usage_monthly (Phase A.2, migration 0083) with JSONB
--    breakdown columns. Aggregate cron populates these per-day; dashboard
--    reads them directly.
-- -----------------------------------------------------------------------------

ALTER TABLE "ai_org_usage_monthly"
  ADD COLUMN IF NOT EXISTS "by_agent" JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS "by_provider" JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS "by_tier" JSONB NOT NULL DEFAULT '{}'::JSONB;

-- -----------------------------------------------------------------------------
-- 3) Per-plan seed updates — markup + max_tier per the canonical commerce
--    table. Wrapped in FOREACH IN ARRAY (7th preservation of the 0075
--    lesson — Postgres versions vary on FOR ... IN SELECT unnest(...)
--    syntax).
--
-- Plan defaults:
--   internal     markup=0   max_tier=3   (Arconique-only, full access)
--   trial        markup=0   max_tier=1
--   basic        markup=30  max_tier=2
--   standard     markup=40  max_tier=2
--   pro          markup=50  max_tier=3
--   enterprise   markup=0   max_tier=3   (custom contracts)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  cfg RECORD;
BEGIN
  FOR cfg IN
    SELECT *
    FROM (VALUES
      ('internal',   0,  3),
      ('trial',      0,  1),
      ('basic',      30, 2),
      ('standard',   40, 2),
      ('pro',        50, 3),
      ('enterprise', 0,  3)
    ) AS t(plan_code, markup, tier)
  LOOP
    UPDATE "subscription_plans"
       SET "markup_percent" = cfg.markup,
           "max_tier" = cfg.tier
     WHERE "plan_code" = cfg.plan_code
       AND ("markup_percent" = 0 AND "max_tier" = 1);  -- only on default
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4) FOREACH IN ARRAY preservation block — touches no schema, present so
--    the cross-stage "0075 lesson preservation" test continues to count
--    this migration. Loops over the 6 known plan_codes + ensures
--    enabled_agent_codes defaults to '{}' (already done by ADD COLUMN
--    DEFAULT, but makes the assertion explicit).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  pc TEXT;
BEGIN
  FOREACH pc IN ARRAY ARRAY[
    'internal',
    'trial',
    'basic',
    'standard',
    'pro',
    'enterprise'
  ]
  LOOP
    UPDATE "subscription_plans"
       SET "enabled_agent_codes" = COALESCE("enabled_agent_codes", ARRAY[]::TEXT[])
     WHERE "plan_code" = pc
       AND "enabled_agent_codes" IS NULL;
  END LOOP;
END $$;

COMMIT;
