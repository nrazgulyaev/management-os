-- =============================================================================
-- 0083 — Development OS · Stage 6.P6-CATCHUP — Org-scoped AI quotas
--
-- 3 new tables — org-level AI quota + usage tracking on top of the existing
-- per-assistant `ai_agent_budgets` (Stage 3.A):
--   - ai_org_quota_limits        per-org daily + monthly cost ceilings (USD).
--                                Enforced by `aiExecute()` before provider
--                                calls.
--   - ai_org_usage_monthly       per-(org, year, month) rolling aggregate.
--                                Updated by `aiExecute()` on every successful
--                                run; reconciled by the `ai_aggregate_daily`
--                                cron from `ai_assistant_runs`. Stripe sync
--                                (Stage 7.D) reads this table for metered
--                                billing.
--   - ai_project_memory          per-project context store. Used by agents
--                                that opt into the memory layer.
--
-- RLS: per-org isolation via is_in_user_organization() (Stage 5.J helper).
-- Uses FOREACH IN ARRAY (5th preservation of the migration 0075 lesson).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) ai_org_quota_limits
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_org_quota_limits" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  -- Daily ceiling — cumulative spend across all assistantKeys + providers.
  -- Hard cap: aiExecute() refuses calls when crossed.
  "daily_limit_usd" NUMERIC(10, 2) NOT NULL DEFAULT 25.00,
  "monthly_limit_usd" NUMERIC(10, 2) NOT NULL DEFAULT 500.00,

  -- 80% triggers warn cron; 95% triggers warn cron with HIGH severity;
  -- 100% triggers hard-cap.
  "warn_threshold_pct" INTEGER NOT NULL DEFAULT 80
    CHECK ("warn_threshold_pct" BETWEEN 50 AND 100),
  "high_threshold_pct" INTEGER NOT NULL DEFAULT 95
    CHECK ("high_threshold_pct" BETWEEN 50 AND 100),

  -- Plan-tier alignment (commerce-ready stub, used by Stage 7.B):
  "plan_code" TEXT,

  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_warn_sent_at" TIMESTAMPTZ,
  "last_high_warn_sent_at" TIMESTAMPTZ,
  "last_blocked_at" TIMESTAMPTZ,
  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("organization_id")
);

CREATE INDEX IF NOT EXISTS "ai_org_quota_limits_org_idx"
  ON "ai_org_quota_limits"("organization_id");
CREATE INDEX IF NOT EXISTS "ai_org_quota_limits_enabled_idx"
  ON "ai_org_quota_limits"("is_enabled");

-- -----------------------------------------------------------------------------
-- 2) ai_org_usage_monthly
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_org_usage_monthly" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  -- Period — calendar year + month (1..12). One row per (org, year, month).
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL CHECK ("month" BETWEEN 1 AND 12),

  -- Aggregates.
  "total_runs" INTEGER NOT NULL DEFAULT 0,
  "total_prompt_tokens" BIGINT NOT NULL DEFAULT 0,
  "total_completion_tokens" BIGINT NOT NULL DEFAULT 0,
  "total_cost_usd" NUMERIC(12, 4) NOT NULL DEFAULT 0,

  -- Rolling-day spent for fast daily-cap comparison without JOIN.
  "today_runs" INTEGER NOT NULL DEFAULT 0,
  "today_cost_usd" NUMERIC(12, 4) NOT NULL DEFAULT 0,
  "today_date" DATE,

  -- Stripe billing sync stub — populated from Stage 7.D onwards.
  "stripe_synced_at" TIMESTAMPTZ,
  "stripe_subscription_item_id" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("organization_id", "year", "month")
);

CREATE INDEX IF NOT EXISTS "ai_org_usage_monthly_org_idx"
  ON "ai_org_usage_monthly"("organization_id");
CREATE INDEX IF NOT EXISTS "ai_org_usage_monthly_period_idx"
  ON "ai_org_usage_monthly"("year", "month");

-- -----------------------------------------------------------------------------
-- 3) ai_project_memory
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_project_memory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" UUID,
  "scope_type" TEXT NOT NULL DEFAULT 'project' CHECK ("scope_type" IN (
    'project', 'agent', 'user', 'global'
  )),
  "scope_id" UUID,

  -- Memory shape.
  "memory_type" TEXT NOT NULL CHECK ("memory_type" IN (
    'fact', 'decision', 'preference', 'context', 'tool_state', 'other'
  )),
  "content" TEXT NOT NULL,
  "embedding_model" TEXT,
  "embedding_vector" TEXT,

  -- Lifecycle.
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "ttl_at" TIMESTAMPTZ,
  "last_accessed_at" TIMESTAMPTZ,
  "access_count" INTEGER NOT NULL DEFAULT 0,

  -- Audit.
  "created_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ai_project_memory_org_idx"
  ON "ai_project_memory"("organization_id");
CREATE INDEX IF NOT EXISTS "ai_project_memory_project_idx"
  ON "ai_project_memory"("project_id");
CREATE INDEX IF NOT EXISTS "ai_project_memory_scope_idx"
  ON "ai_project_memory"("scope_type", "scope_id");
CREATE INDEX IF NOT EXISTS "ai_project_memory_active_idx"
  ON "ai_project_memory"("is_active") WHERE "is_active" = true;

-- -----------------------------------------------------------------------------
-- 4) RLS — per-org isolation via is_in_user_organization() (Stage 5.J helper).
--
-- Uses FOREACH t IN ARRAY ARRAY[...] per the migration 0075 lesson — the 5th
-- preservation across Stage 6 migrations.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_org_quota_limits',
    'ai_org_usage_monthly',
    'ai_project_memory'
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
-- 5) updated_at trigger (distinct trigger function for cross-stage isolation).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_org_set_updated_at()
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
    'ai_org_quota_limits',
    'ai_org_usage_monthly',
    'ai_project_memory'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I; '
      'CREATE TRIGGER %I BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION ai_org_set_updated_at();',
      t || '_set_updated_at', t,
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;

COMMIT;
