-- Hotfix HF-3 — widen the org_ai_agent_config.agent_key CHECK
-- constraint so per-org enablement rows can be inserted for the
-- five MD-5 cabinet co-pilots (investor / front-office /
-- housekeeping / concierge / security).
--
-- Migration 0090 originally pinned the constraint to the 9 Stage-9.F
-- configurable agents. Migrations 0098–0102 added new
-- `agent_configurations` rows for MD-5 agents but did NOT touch
-- this constraint — so clicking "Enable" on any of the five new
-- agents in the per-org settings UI would fail at INSERT time.
-- Without this migration the cabinet apexes' "Configure key" CTA
-- on /dashboard/settings/ai-agents/<key> would also 404 (Hotfix
-- HF-3 Task 1.4 verifies the route renders; this migration backs it
-- up so the form's save action succeeds).

BEGIN;

ALTER TABLE "org_ai_agent_config"
  DROP CONSTRAINT IF EXISTS "org_ai_agent_config_agent_key_check";

ALTER TABLE "org_ai_agent_config"
  ADD CONSTRAINT "org_ai_agent_config_agent_key_check"
  CHECK (agent_key IN (
    'qs_cost_analyst',
    'procurement_analyst',
    'tax_assistant',
    'marketing_assistant',
    'executive_business',
    'daily_digest',
    'weekly_plan',
    'inbox',
    'memory',
    -- Sprint MD-5 additions
    'investor_copilot',
    'front_office_copilot',
    'housekeeping_scheduler',
    'concierge_handoff',
    'security_copilot'
  ));

COMMIT;
