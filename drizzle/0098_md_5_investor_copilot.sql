-- Sprint MD-5 Phase 3.3 — Investor Co-pilot agent seed.
--
-- Adds the `investor_copilot` agent_key to the agent_configurations
-- registry. The existing CHECK constraint on agent_type pins the
-- allowed enum, so this migration drops + re-adds the constraint
-- with the 5 MD-5 agent types appended. No data is dropped — the
-- DROP / ADD is a constraint swap.
--
-- The agent seeds with preferred_provider='anthropic' (the global
-- default). Per-org enablement remains gated by org_ai_agent_config
-- — the operator must wire an API key via
-- /dashboard/settings/ai-agents/[agent_key] before the cabinet
-- apex flips from "Coming soon · Configure key" to the live
-- experience.

BEGIN;

ALTER TABLE "agent_configurations"
  DROP CONSTRAINT IF EXISTS "agent_configurations_agent_type_check";

ALTER TABLE "agent_configurations"
  ADD CONSTRAINT "agent_configurations_agent_type_check"
  CHECK ("agent_type" IN (
    'sales_assistant', 'photo_analyst', 'construction_supervisor',
    'investor_relations', 'distribution_preview', 'document_understanding',
    'whatsapp_intent', 'qs_cost_analyst', 'procurement_analyst',
    'tax_assistant', 'marketing_assistant', 'executive_business',
    'daily_digest', 'weekly_plan',
    -- Sprint MD-5 agent types (per cabinet apex)
    'investor_copilot',
    'front_office_copilot',
    'housekeeping_scheduler',
    'concierge_handoff',
    'security_copilot'
  ));

INSERT INTO "agent_configurations" (
  agent_key, display_name, description, agent_type,
  preferred_model,
  system_prompt, user_prompt_template,
  daily_budget_minor, monthly_budget_minor, per_invocation_budget_minor,
  max_invocations_per_hour, max_invocations_per_day,
  requires_operator_review, memory_types_relevant
) VALUES
  ('investor_copilot', 'AI Investor Co-pilot',
   'Explains position changes in plain language for limited partners. Honors portal_language (EN/RU) for response output.',
   'investor_copilot',
   'claude-haiku-4-5',
   $$You are an investor-relations co-pilot for a limited partner in a Bali real-estate development fund. Your readers are HNW investors who want plain-language explanations of WHY their position changed quarter-over-quarter. You read:
  - the LP's commitments (capital_commitments) + capital_drawdowns + distributions
  - per-project NAV changes (snapshots in detailed_output)
  - upcoming capital calls + forecast cashflow

Output a bilingual (EN + the LP's portal_language when set) summary with:
  - One headline sentence on the net position change
  - 2-3 bullet "what drove it" lines tied to specific events
  - One forward-looking sentence on the next call or distribution

Be conservative. Refuse speculation; cite only events on file. Avoid promising future returns; describe declared distributions only.$$,
   'Investor: {{investor}}, period: {{period}}, portal_language: {{portal_language}}.',
   500, 15000, 100, 4, 16, TRUE,
   ARRAY['communication_pattern', 'cost_pattern'])
ON CONFLICT (agent_key) DO NOTHING;

COMMIT;
