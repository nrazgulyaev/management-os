-- Stage 10.5.B — Per-tenant AI agent provider configuration
-- ============================================================================
--
-- Extends `org_ai_agent_config` (migration 0090, Stage 9.F.1) with per-org
-- per-agent provider routing + encrypted API key storage + test-connection
-- status tracking.
--
-- Why per-agent provider:
--   - Some orgs prefer OpenAI for one agent (e.g. marketing copy where
--     they have a customer-tuned GPT prompt) and Anthropic for another
--     (e.g. cost-analysis where they trust Claude's reasoning).
--   - Per-agent keys also enable cost attribution at the agent level
--     when an org runs a mix of providers.
--
-- Encryption envelope (AES-256-GCM via STAY_LINK_KMS_SECRET, the same
-- secret already used for channel credentials and Wi-Fi passwords). Stored
-- as JSONB so the {v, k, c} envelope round-trips cleanly. NULL means
-- "use the system default API key" (the env var ANTHROPIC_API_KEY etc.).
--
-- test_connection_status semantics:
--   NULL                — never tested (or test cleared)
--   'ok'                — last test succeeded
--   'failed'            — last test failed; last_test_error has the message
--
-- Rollback:
--   ALTER TABLE org_ai_agent_config
--     DROP COLUMN provider,
--     DROP COLUMN model,
--     DROP COLUMN api_key_encrypted,
--     DROP COLUMN api_key_set_at,
--     DROP COLUMN last_test_status,
--     DROP COLUMN last_test_at,
--     DROP COLUMN last_test_error;

ALTER TABLE org_ai_agent_config
  ADD COLUMN provider text,
  ADD COLUMN model text,
  ADD COLUMN api_key_encrypted jsonb,
  ADD COLUMN api_key_set_at timestamptz,
  ADD COLUMN last_test_status text,
  ADD COLUMN last_test_at timestamptz,
  ADD COLUMN last_test_error text;

-- Provider must be one of the supported names when set.
ALTER TABLE org_ai_agent_config
  ADD CONSTRAINT org_ai_agent_config_provider_check
  CHECK (provider IS NULL OR provider IN ('anthropic', 'openai', 'gemini'));

-- Test status must be one of the supported values when set.
ALTER TABLE org_ai_agent_config
  ADD CONSTRAINT org_ai_agent_config_last_test_status_check
  CHECK (last_test_status IS NULL OR last_test_status IN ('ok', 'failed'));

COMMENT ON COLUMN org_ai_agent_config.provider IS
  'Optional per-agent provider override: anthropic | openai | gemini. NULL = system default. Stage 10.5.B.2.';
COMMENT ON COLUMN org_ai_agent_config.model IS
  'Optional model override (e.g. gpt-4o, claude-opus-4-7). NULL = provider default. Stage 10.5.B.2.';
COMMENT ON COLUMN org_ai_agent_config.api_key_encrypted IS
  'Encrypted API key envelope ({v, k, c}). Encrypted with STAY_LINK_KMS_SECRET. NULL = use system env var. Stage 10.5.B.1.';
COMMENT ON COLUMN org_ai_agent_config.api_key_set_at IS
  'When the encrypted API key was last written. Surfaces "Key set X days ago" in the UI. Stage 10.5.B.1.';
COMMENT ON COLUMN org_ai_agent_config.last_test_status IS
  'Result of the last test-connection attempt: ok | failed | NULL. Stage 10.5.B.3.';
COMMENT ON COLUMN org_ai_agent_config.last_test_at IS
  'When the last test-connection was attempted. Stage 10.5.B.3.';
COMMENT ON COLUMN org_ai_agent_config.last_test_error IS
  'Operator-readable error message from the last failed test, redacted of any token-bearing strings. Stage 10.5.B.3.';
