-- =============================================================================
-- 0041 — Development OS · Stage 3.A — AI Provider Foundation
--
-- Adds cost tracking + budget enforcement on top of the existing
-- ai_assistant_runs table (created in 0006_ai_assistant.sql /
-- equivalent — kept in src/lib/db/schema/ai.ts).
--
-- Two changes:
--
-- 1) Extend ai_assistant_runs with cost columns. Every Claude call
--    records its input/output tokens already; this stage records the
--    USD cost computed from per-model rates so spend dashboards do not
--    need to recompute on every render.
--
-- 2) New ai_agent_budgets table — per-assistant_key daily + monthly
--    USD ceilings checked before each run. When a ceiling is hit the
--    provider call short-circuits and writes a 'budget_exceeded' row
--    in ai_assistant_runs (no Anthropic charge incurred).
--
-- All money in USD with 4 decimal places (NUMERIC(12,4) = up to
-- $99,999,999.9999, which is plenty given a single Opus 4.7 call costs
-- < $0.25).
--
-- Idempotent. Wrapped in BEGIN; ... COMMIT;.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) ai_assistant_runs — add cost columns
-- =============================================================================
ALTER TABLE "ai_assistant_runs"
  ADD COLUMN IF NOT EXISTS "input_cost_usd" NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS "output_cost_usd" NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS "total_cost_usd" NUMERIC(12, 4);

-- Index by created_at + assistant_key for the cost dashboard's
-- "spend by assistant per day" query. Existing single-column indexes
-- (ai_runs_assistant_idx, ai_runs_created_idx) stay; the composite
-- helps the cost dashboard avoid sorting.
CREATE INDEX IF NOT EXISTS "ai_runs_assistant_created_cost_idx"
  ON "ai_assistant_runs" ("assistant_key", "created_at" DESC)
  WHERE "total_cost_usd" IS NOT NULL;

-- Widen the status CHECK if one exists, otherwise add it. Stage 2.2.A
-- left status as plain text and existing callers (operations-copilot
-- service, lead actions) emit a mix of 'running', 'success', 'fallback',
-- 'error', 'skipped'. Stage 3.A documents the canonical superset and
-- adds two new states: 'budget_exceeded' (provider call short-circuited
-- because daily/monthly USD ceiling reached) and 'dry_run' (AI_DRY_RUN
-- enabled — provider returned a deterministic stub).
DO $$
BEGIN
  ALTER TABLE "ai_assistant_runs"
    DROP CONSTRAINT IF EXISTS "ai_runs_status_check";
  ALTER TABLE "ai_assistant_runs"
    ADD CONSTRAINT "ai_runs_status_check"
    CHECK ("status" IN (
      'running','succeeded','success','failed','error',
      'blocked','fallback','skipped',
      'budget_exceeded','dry_run'
    ));
END $$;

-- =============================================================================
-- 2) ai_agent_budgets — per-assistant_key spend limits
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ai_agent_budgets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "assistant_key" TEXT NOT NULL UNIQUE,
  "daily_limit_usd" NUMERIC(10, 2) NOT NULL,
  "monthly_limit_usd" NUMERIC(10, 2) NOT NULL,
  "alert_threshold_pct" INTEGER NOT NULL DEFAULT 80
    CHECK ("alert_threshold_pct" BETWEEN 1 AND 100),
  "is_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "last_alert_at" TIMESTAMPTZ,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ai_agent_budgets_daily_le_monthly"
    CHECK ("daily_limit_usd" <= "monthly_limit_usd")
);

CREATE INDEX IF NOT EXISTS "ai_agent_budgets_enabled_idx"
  ON "ai_agent_budgets" ("is_enabled")
  WHERE "is_enabled" = TRUE;

-- =============================================================================
-- RLS — ai_agent_budgets is internal-only (read+write); investors never
-- see it. ai_assistant_runs already has RLS from its original migration.
-- =============================================================================
ALTER TABLE "ai_agent_budgets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_agent_budgets" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal_read" ON "ai_agent_budgets";
CREATE POLICY "internal_read" ON "ai_agent_budgets"
  FOR SELECT USING (public.is_internal_user());

DROP POLICY IF EXISTS "internal_write" ON "ai_agent_budgets";
CREATE POLICY "internal_write" ON "ai_agent_budgets"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

-- updated_at trigger (mirrors patterns from 0033/0040).
CREATE OR REPLACE FUNCTION "ai_agent_budgets_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ai_agent_budgets_updated_at_trg" ON "ai_agent_budgets";
CREATE TRIGGER "ai_agent_budgets_updated_at_trg"
  BEFORE UPDATE ON "ai_agent_budgets"
  FOR EACH ROW EXECUTE FUNCTION "ai_agent_budgets_set_updated_at"();

COMMIT;
