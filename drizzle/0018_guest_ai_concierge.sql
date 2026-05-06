-- =============================================================================
-- 0018 — Guest AI Concierge v0 (v9H).
--
-- Adds three internal-only tables:
--   • `guest_ai_concierge_sessions`  – one chat thread per stay token
--   • `guest_ai_concierge_messages`  – append-only conversation transcript
--   • `guest_ai_concierge_runs`      – per-message AI invocation metrics
--
-- All tables are RLS-forced internal-only. The guest portal at
-- `/stay/[token]/concierge` never queries these directly through an
-- authenticated guest session — the server route validates the stay
-- token + verification gate, then uses the service-role client to
-- read/write the guest's own session.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) guest_ai_concierge_sessions
CREATE TABLE IF NOT EXISTS "guest_ai_concierge_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "guest_stay_token_id" uuid NOT NULL
    REFERENCES "guest_stay_tokens"("id") ON DELETE CASCADE,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'active',
  "title" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "last_message_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_ai_concierge_sessions"
    ADD CONSTRAINT guest_ai_concierge_sessions_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_ai_concierge_sessions_token_idx"
  ON "guest_ai_concierge_sessions" ("guest_stay_token_id");
CREATE INDEX IF NOT EXISTS "guest_ai_concierge_sessions_booking_idx"
  ON "guest_ai_concierge_sessions" ("booking_id");
CREATE INDEX IF NOT EXISTS "guest_ai_concierge_sessions_status_idx"
  ON "guest_ai_concierge_sessions" ("status");
CREATE INDEX IF NOT EXISTS "guest_ai_concierge_sessions_last_message_idx"
  ON "guest_ai_concierge_sessions" ("last_message_at" DESC);

-- One active session per token at a time. Archiving the row releases
-- the slot so a future visit can spin up a fresh thread.
CREATE UNIQUE INDEX IF NOT EXISTS "guest_ai_concierge_sessions_active_unique"
  ON "guest_ai_concierge_sessions" ("guest_stay_token_id")
  WHERE "status" = 'active';

-- 2) guest_ai_concierge_messages
CREATE TABLE IF NOT EXISTS "guest_ai_concierge_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL
    REFERENCES "guest_ai_concierge_sessions"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "safety_status" text NOT NULL DEFAULT 'ok',
  "citations_json" jsonb,
  "tool_context_json" jsonb,
  "model" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "latency_ms" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_ai_concierge_messages"
    ADD CONSTRAINT guest_ai_concierge_messages_role_check
    CHECK ("role" IN ('user','assistant','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_concierge_messages"
    ADD CONSTRAINT guest_ai_concierge_messages_safety_check
    CHECK ("safety_status" IN ('ok','refused','redacted','error'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_ai_concierge_messages_session_idx"
  ON "guest_ai_concierge_messages" ("session_id", "created_at");
CREATE INDEX IF NOT EXISTS "guest_ai_concierge_messages_safety_idx"
  ON "guest_ai_concierge_messages" ("safety_status");

-- 3) guest_ai_concierge_runs
CREATE TABLE IF NOT EXISTS "guest_ai_concierge_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL
    REFERENCES "guest_ai_concierge_sessions"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'running',
  "model" text,
  "prompt_hash" text,
  "safety_flags" jsonb,
  "allowed_context_keys" jsonb,
  "error_message" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_ai_concierge_runs"
    ADD CONSTRAINT guest_ai_concierge_runs_status_check
    CHECK ("status" IN ('running','succeeded','failed','refused'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_ai_concierge_runs_session_idx"
  ON "guest_ai_concierge_runs" ("session_id");
CREATE INDEX IF NOT EXISTS "guest_ai_concierge_runs_status_idx"
  ON "guest_ai_concierge_runs" ("status");
CREATE INDEX IF NOT EXISTS "guest_ai_concierge_runs_started_idx"
  ON "guest_ai_concierge_runs" ("started_at" DESC);

-- =============================================================================
-- 4) RLS — every new table is internal-only. Guests never query directly.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'guest_ai_concierge_sessions',
      'guest_ai_concierge_messages',
      'guest_ai_concierge_runs'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_read ON %I; '
      'CREATE POLICY internal_read ON %I FOR SELECT '
      'USING (public.is_internal_user());',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_write ON %I; '
      'CREATE POLICY internal_write ON %I FOR ALL '
      'USING (public.is_internal_user()) '
      'WITH CHECK (public.is_internal_user());',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
