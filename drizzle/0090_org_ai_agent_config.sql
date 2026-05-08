-- Stage 9.F.1 — Per-tenant AI agent configuration
-- ============================================================================
--
-- Each tenant can opt-out of individual AI agents even if their plan allows
-- them. Plan-tier eligibility (Stage 7.B `plan_features`) is the upper
-- bound; this table is the per-org override that lets an admin turn an
-- agent OFF without changing plans. Default behavior: an agent allowed
-- by the plan is enabled unless this table has an explicit override.
--
-- Schema:
--   organization_id  → tenant boundary (NOT NULL FK).
--   agent_key        → matches src/features/ai-agents/run-agent-config.ts
--                      `RUN_NOW_AGENTS` keys + a few system surfaces
--                      ('inbox', 'memory'). Free-text + CHECK against the
--                      same canonical list.
--   is_enabled       → TRUE = opt-in (default if missing row),
--                      FALSE = opt-out.
--   custom_prompt    → optional override for the agent's kickoff prompt.
--                      NULL means use the canonical RUN_NOW_AGENTS prompt.
--   notes            → free text for the operator.
--   updated_by       → which app_user toggled it (audit trail).
--
-- One row per (org, agent_key). Bumping is_enabled or custom_prompt is
-- an UPDATE; the row is created lazily on first toggle / first override.
--
-- RLS: standard org_isolation + internal_bypass pattern (matches Stage 7.B
-- subscription tables and Stage 9.D team_invitations).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "org_ai_agent_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "agent_key" text NOT NULL CHECK (agent_key IN (
    'qs_cost_analyst',
    'procurement_analyst',
    'tax_assistant',
    'marketing_assistant',
    'executive_business',
    'daily_digest',
    'weekly_plan',
    'inbox',
    'memory'
  )),
  "is_enabled" boolean NOT NULL DEFAULT true,
  "custom_prompt" text,
  "notes" text,
  "updated_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "org_ai_agent_config_org_agent_uniq" UNIQUE ("organization_id", "agent_key")
);

CREATE INDEX IF NOT EXISTS "org_ai_agent_config_org_idx"
  ON "org_ai_agent_config"("organization_id");
CREATE INDEX IF NOT EXISTS "org_ai_agent_config_agent_idx"
  ON "org_ai_agent_config"("agent_key");

-- RLS — same pattern as subscription tables + team_invitations.
ALTER TABLE "org_ai_agent_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_ai_agent_config" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'org_ai_agent_config'
       AND policyname = 'org_ai_agent_config_org_isolation'
  ) THEN
    EXECUTE 'CREATE POLICY org_ai_agent_config_org_isolation ON "org_ai_agent_config" ' ||
            'FOR ALL ' ||
            'USING (public.is_in_user_organization(organization_id)) ' ||
            'WITH CHECK (public.is_in_user_organization(organization_id))';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'org_ai_agent_config'
       AND policyname = 'org_ai_agent_config_internal_bypass'
  ) THEN
    EXECUTE 'CREATE POLICY org_ai_agent_config_internal_bypass ON "org_ai_agent_config" ' ||
            'FOR ALL ' ||
            'USING (public.is_internal_user()) ' ||
            'WITH CHECK (public.is_internal_user())';
  END IF;
END $$;

COMMIT;
