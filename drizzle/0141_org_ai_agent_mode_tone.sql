-- ============================================================================
-- Block 03 (AI INBOX + AGENTS, deepen) — per-agent no-code config surface
-- ============================================================================
--
-- Extends `org_ai_agent_config` (migration 0090 / 0095) with the three knobs
-- a no-code operator needs to control an agent WITHOUT touching the prompt:
--
--   agent_mode        — auto | semi | off
--                       auto = AI may send replies without a human (still
--                              audit-logged); semi = AI drafts, a human must
--                              review + press Send (HITL, the default);
--                              off  = no AI drafting at all for this agent.
--                       Default 'semi' so existing rows + new agents are
--                       human-in-the-loop until an operator opts into auto.
--
--   tone              — short free-text style directive folded into the
--                       draft system prompt ("warm and concise", "formal",
--                       "playful"…). NULL = the agent's built-in default tone.
--
--   knowledge_sources — jsonb flag-set toggling which grounding sources the
--                       drafter is allowed to read. Shape:
--                         { "conversation": true, "project_memory": true,
--                           "templates": true }
--                       NULL = all defaults on. Lets an operator restrict an
--                       agent to ONLY the conversation (no memory leakage).
--
-- Idempotent: guarded with IF NOT EXISTS so re-running is a no-op. The CHECK
-- on agent_mode is added only when it does not already exist.
--
-- Rollback:
--   ALTER TABLE org_ai_agent_config
--     DROP COLUMN IF EXISTS agent_mode,
--     DROP COLUMN IF EXISTS tone,
--     DROP COLUMN IF EXISTS knowledge_sources;

ALTER TABLE org_ai_agent_config
  ADD COLUMN IF NOT EXISTS agent_mode text NOT NULL DEFAULT 'semi';

ALTER TABLE org_ai_agent_config
  ADD COLUMN IF NOT EXISTS tone text;

ALTER TABLE org_ai_agent_config
  ADD COLUMN IF NOT EXISTS knowledge_sources jsonb;

-- agent_mode must be one of the three supported values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'org_ai_agent_config_agent_mode_check'
  ) THEN
    ALTER TABLE org_ai_agent_config
      ADD CONSTRAINT org_ai_agent_config_agent_mode_check
      CHECK (agent_mode IN ('auto', 'semi', 'off'));
  END IF;
END $$;

COMMENT ON COLUMN org_ai_agent_config.agent_mode IS
  'No-code autonomy mode: auto (AI may send) | semi (AI drafts, human sends — HITL default) | off (no AI drafting). Block 03.';
COMMENT ON COLUMN org_ai_agent_config.tone IS
  'Optional free-text tone directive folded into the draft system prompt. NULL = agent default tone. Block 03.';
COMMENT ON COLUMN org_ai_agent_config.knowledge_sources IS
  'Optional jsonb flag-set toggling allowed grounding sources ({conversation, project_memory, templates}). NULL = all on. Block 03.';
