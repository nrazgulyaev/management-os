-- =============================================================================
-- 0019 — Guest Concierge Operational Handoff (v9I).
--
-- Adds one internal-only table:
--   • `guest_ai_handoffs` — every escalation from /stay/[token]/concierge
--     into staff. Each row optionally links to a `service_requests` row
--     (the operational system of record) and a
--     `guest_ai_concierge_sessions` row (the conversation context).
--
-- The AI never writes to this table directly. The guest taps "Ask
-- human concierge" / "Report this to staff" in the chat, the server
-- action validates token + verification + rate limit, redacts the
-- conversation context, and inserts a handoff + a service_requests
-- row in the same transaction.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "guest_ai_handoffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "guest_ai_concierge_session_id" uuid NOT NULL
    REFERENCES "guest_ai_concierge_sessions"("id") ON DELETE CASCADE,
  "guest_stay_token_id" uuid NOT NULL
    REFERENCES "guest_stay_tokens"("id") ON DELETE CASCADE,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "service_request_id" uuid
    REFERENCES "service_requests"("id") ON DELETE SET NULL,
  "handoff_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'created',
  "guest_summary" text NOT NULL,
  "last_messages_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "safety_flags" jsonb,
  "priority" text NOT NULL DEFAULT 'normal',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "acknowledged_at" timestamptz,
  "resolved_at" timestamptz,
  "created_by_ip_hash" text,
  "created_by_user_agent" text
);

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoffs"
    ADD CONSTRAINT guest_ai_handoffs_handoff_type_check
    CHECK ("handoff_type" IN (
      'ask_human','report_problem','emergency_concern',
      'service_question','ai_refusal_followup'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoffs"
    ADD CONSTRAINT guest_ai_handoffs_status_check
    CHECK ("status" IN (
      'created','linked_to_request','acknowledged','resolved','cancelled'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoffs"
    ADD CONSTRAINT guest_ai_handoffs_priority_check
    CHECK ("priority" IN ('low','normal','high','urgent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_ai_handoffs_session_idx"
  ON "guest_ai_handoffs" ("guest_ai_concierge_session_id");
CREATE INDEX IF NOT EXISTS "guest_ai_handoffs_token_idx"
  ON "guest_ai_handoffs" ("guest_stay_token_id");
CREATE INDEX IF NOT EXISTS "guest_ai_handoffs_booking_idx"
  ON "guest_ai_handoffs" ("booking_id");
CREATE INDEX IF NOT EXISTS "guest_ai_handoffs_service_request_idx"
  ON "guest_ai_handoffs" ("service_request_id");
CREATE INDEX IF NOT EXISTS "guest_ai_handoffs_status_idx"
  ON "guest_ai_handoffs" ("status");
CREATE INDEX IF NOT EXISTS "guest_ai_handoffs_priority_idx"
  ON "guest_ai_handoffs" ("priority");
CREATE INDEX IF NOT EXISTS "guest_ai_handoffs_created_at_idx"
  ON "guest_ai_handoffs" ("created_at" DESC);

-- =============================================================================
-- RLS — internal-only. Guests never query this table directly.
-- =============================================================================
ALTER TABLE "guest_ai_handoffs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guest_ai_handoffs" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_read ON "guest_ai_handoffs";
CREATE POLICY internal_read ON "guest_ai_handoffs"
  FOR SELECT USING (public.is_internal_user());

DROP POLICY IF EXISTS internal_write ON "guest_ai_handoffs";
CREATE POLICY internal_write ON "guest_ai_handoffs"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

COMMIT;
