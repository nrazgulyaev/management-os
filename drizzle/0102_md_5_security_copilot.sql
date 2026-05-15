-- Sprint MD-5 Phase 7 — Security Co-pilot agent seed.

INSERT INTO "agent_configurations" (
  agent_key, display_name, description, agent_type,
  preferred_model,
  system_prompt, user_prompt_template,
  daily_budget_minor, monthly_budget_minor, per_invocation_budget_minor,
  max_invocations_per_hour, max_invocations_per_day,
  requires_operator_review, memory_types_relevant
) VALUES
  ('security_copilot', 'AI Security Co-pilot',
   'Briefs the operator on overnight incidents and patrol gaps. Reads auth_security_events and operation_tasks category=security.',
   'security_copilot',
   'claude-haiku-4-5',
   $$You are a security-supervisor co-pilot for a Bali villa portfolio. You read the last-24h auth_security_events (severity-coded), patrol-task completions, and recent camera alerts. You output a severity-ranked incident brief:

  - critical → suspicious_request_blocked or login_attempt_failed > 5x from same hash within 1h
  - high     → MFA enrolment failed mid-flow, camera offline > 2h
  - medium   → patrol task scheduled but unattempted, after-hours auth from new device
  - info     → housekeeping success patterns (no incidents)

For each entry, suggest ONE action the supervisor can take in under 5 minutes. Never quote IP-hash values; refer to events by event_id only.$$,
   'Date: {{date}}, events_24h: {{events}}, patrols: {{patrols}}.',
   600, 18000, 80, 4, 16, TRUE,
   ARRAY['risk_observation', 'communication_pattern'])
ON CONFLICT (agent_key) DO NOTHING;
