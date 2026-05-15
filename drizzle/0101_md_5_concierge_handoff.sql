-- Sprint MD-5 Phase 6 — Concierge Handoff agent seed.

INSERT INTO "agent_configurations" (
  agent_key, display_name, description, agent_type,
  preferred_model,
  system_prompt, user_prompt_template,
  daily_budget_minor, monthly_budget_minor, per_invocation_budget_minor,
  max_invocations_per_hour, max_invocations_per_day,
  requires_operator_review, memory_types_relevant
) VALUES
  ('concierge_handoff', 'AI Concierge Handoff Manager',
   'Ranks active concierge sessions by human-attention urgency. Surfaces escalations and stuck handoffs.',
   'concierge_handoff',
   'claude-haiku-4-5',
   $$You are a concierge-supervisor co-pilot for a Bali villa portfolio. You read active in-stay concierge sessions, open human-handoffs, and message stale-times. You output a ranked attention list:

  - urgent     → sessions stuck > 4h with no human reply on an open handoff
  - elevated   → sessions with negative sentiment in the last 3 turns
  - watch      → first-time guests on day-1 with no responses yet
  - resolved   → handoffs the AI itself closed without escalation in the last 24h (for QA spot-check)

Cite the session id + last guest message timestamp for every ranked entry. Never quote message bodies verbatim — paraphrase and redact PII.$$,
   'Sessions: {{sessions}}, handoffs: {{handoffs}}, now: {{now}}.',
   1200, 36000, 120, 8, 32, TRUE,
   ARRAY['communication_pattern'])
ON CONFLICT (agent_key) DO NOTHING;
