-- DAILY-DIGEST-SPRINT-1 P1.1 — extend agent_runs for scheduled runs +
-- per-run tool-call introspection.
--
-- New columns:
--   · run_type        — 'user_initiated' (existing user chat) vs
--                       'scheduled' (cron-triggered Daily Digest).
--                       Defaults to 'user_initiated' so existing
--                       tax_assistant rows keep working unchanged.
--   · scheduled_for   — the local-tz DATE the digest covers (NULL
--                       for user-initiated runs).
--   · notification_id — back-ref to the notifications row produced
--                       by this run (NULL until Phase 4 wires the
--                       notifications surface).
--   · metadata        — jsonb scratchpad for tool-call logs +
--                       future agent introspection. No GIN index
--                       yet — defer until Phase 2 query patterns
--                       are known.
--
-- Partial index supports the idempotency check in the cron handler:
--   SELECT 1 FROM agent_runs
--    WHERE agent_id = ? AND run_type='scheduled'
--      AND scheduled_for = ? AND user_id = ?

BEGIN;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS run_type        text NOT NULL DEFAULT 'user_initiated'
    CHECK (run_type IN ('user_initiated', 'scheduled')),
  ADD COLUMN IF NOT EXISTS scheduled_for   date,
  ADD COLUMN IF NOT EXISTS notification_id uuid,
  ADD COLUMN IF NOT EXISTS metadata        jsonb;

-- Idempotency lookup: scheduled runs by (agent, user, date).
-- Agent identity is by agent_id (uuid), NOT agent_code — matches the
-- production schema (P5.3 inference path keys by agent_id).
CREATE INDEX IF NOT EXISTS idx_agent_runs_scheduled
  ON agent_runs (agent_id, scheduled_for, user_id)
  WHERE run_type = 'scheduled';

COMMIT;
