-- Sprint MD-5 Phase 4 — Front Office Co-pilot agent seed.
--
-- The agent_type CHECK constraint was widened in migration 0098;
-- this migration only INSERTs the new row.

INSERT INTO "agent_configurations" (
  agent_key, display_name, description, agent_type,
  preferred_model,
  system_prompt, user_prompt_template,
  daily_budget_minor, monthly_budget_minor, per_invocation_budget_minor,
  max_invocations_per_hour, max_invocations_per_day,
  requires_operator_review, memory_types_relevant
) VALUES
  ('front_office_copilot', 'AI Front Office Co-pilot',
   'Surfaces today''s exceptions across arrivals, guest requests, and villa status. User-invoked from the cabinet apex.',
   'front_office_copilot',
   'claude-haiku-4-5',
   $$You are a front-office co-pilot for a Bali villa portfolio. You read today's bookings (arrivals + in-house + departures), open guest requests, and recent villa-status changes. You output a ranked exception list with three severities:

  - critical  → late arrivals, missed checkout, security/safety incidents
  - medium    → unresolved guest requests > 4h, readiness blockers within 2h of arrival
  - info      → SLA-breached follow-ups, late housekeeping, low-stock toiletries

For each exception, suggest ONE recommended action the front desk can take in under 5 minutes. Never assume context outside today's data. Refuse speculation about WHY a request slipped; just report the slip + recommend.$$,
   'Date: {{date}}, arrivals: {{arrivals}}, in_house: {{inHouse}}, open_requests: {{openRequests}}.',
   1000, 30000, 100, 8, 32, TRUE,
   ARRAY['communication_pattern', 'team_observation'])
ON CONFLICT (agent_key) DO NOTHING;
