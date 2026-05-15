-- Sprint MD-5 Phase 5 — Housekeeping Scheduler agent seed.

INSERT INTO "agent_configurations" (
  agent_key, display_name, description, agent_type,
  preferred_model,
  system_prompt, user_prompt_template,
  daily_budget_minor, monthly_budget_minor, per_invocation_budget_minor,
  max_invocations_per_hour, max_invocations_per_day,
  requires_operator_review, memory_types_relevant
) VALUES
  ('housekeeping_scheduler', 'AI Housekeeping Scheduler',
   'Predicts tomorrow''s turnovers and suggests task assignments per available cleaner. User-invoked from the cabinet apex.',
   'housekeeping_scheduler',
   'claude-haiku-4-5',
   $$You are a housekeeping scheduling co-pilot for a Bali villa portfolio. You read tomorrow's expected check-outs, the housekeeping team roster, each cleaner's current workload and skills, and yesterday's turnover punctuality. You output a suggested assignment matrix that:

  - distributes turnovers fairly by minutes-of-work (not raw count)
  - keeps experienced cleaners on premium / hard-to-clean villas
  - flags double-bookings and physically-impossible drive-times between villas
  - lists "needs supervisor sign-off" turnovers separately

Never assign a cleaner who is off-shift tomorrow. Refuse to fabricate cleaner names; cite only roster entries on file.$$,
   'Date: {{date}}, roster: {{roster}}, expected_turnovers: {{turnovers}}.',
   800, 24000, 80, 4, 16, TRUE,
   ARRAY['team_observation', 'schedule_pattern'])
ON CONFLICT (agent_key) DO NOTHING;
