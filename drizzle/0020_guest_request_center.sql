-- =============================================================================
-- 0020 — Guest Request Center + Concierge Handoff Replies (v9J).
--
-- Adds:
--   • `guest_ai_handoff_replies` — append-only two-way conversation log
--     between the guest and staff for a given handoff.
--   • Six new columns on `guest_ai_handoffs` for SLA metrics + unread
--     counters: `first_staff_reply_at`, `last_guest_reply_at`,
--     `last_staff_reply_at`, `guest_unread_count`, `staff_unread_count`.
--
-- All replies redact through the same scrubber used by the v9I handoff
-- summary. The guest portal fetches `visibility='guest_visible'` rows
-- only; internal notes never leave staff surfaces.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) guest_ai_handoff_replies
CREATE TABLE IF NOT EXISTS "guest_ai_handoff_replies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "handoff_id" uuid NOT NULL
    REFERENCES "guest_ai_handoffs"("id") ON DELETE CASCADE,
  "service_request_id" uuid
    REFERENCES "service_requests"("id") ON DELETE SET NULL,
  "author_type" text NOT NULL,
  "author_app_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "visibility" text NOT NULL DEFAULT 'guest_visible',
  "body" text NOT NULL,
  "body_redacted" text NOT NULL,
  "reply_type" text NOT NULL DEFAULT 'message',
  "status_snapshot" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "read_by_guest_at" timestamptz,
  "read_by_staff_at" timestamptz
);

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_replies"
    ADD CONSTRAINT guest_ai_handoff_replies_author_type_check
    CHECK ("author_type" IN ('guest','staff','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_replies"
    ADD CONSTRAINT guest_ai_handoff_replies_visibility_check
    CHECK ("visibility" IN ('guest_visible','internal_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_replies"
    ADD CONSTRAINT guest_ai_handoff_replies_reply_type_check
    CHECK ("reply_type" IN (
      'message','status_update','resolution','internal_note'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_ai_handoff_replies_handoff_idx"
  ON "guest_ai_handoff_replies" ("handoff_id", "created_at");
CREATE INDEX IF NOT EXISTS "guest_ai_handoff_replies_service_request_idx"
  ON "guest_ai_handoff_replies" ("service_request_id");
CREATE INDEX IF NOT EXISTS "guest_ai_handoff_replies_created_at_idx"
  ON "guest_ai_handoff_replies" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "guest_ai_handoff_replies_visibility_idx"
  ON "guest_ai_handoff_replies" ("visibility");

-- 2) Add SLA + unread columns on guest_ai_handoffs (v9I table). Idempotent
--    via ADD COLUMN IF NOT EXISTS.
ALTER TABLE "guest_ai_handoffs"
  ADD COLUMN IF NOT EXISTS "first_staff_reply_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "last_guest_reply_at"  timestamptz,
  ADD COLUMN IF NOT EXISTS "last_staff_reply_at"  timestamptz,
  ADD COLUMN IF NOT EXISTS "guest_unread_count"   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "staff_unread_count"   integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "guest_ai_handoffs_first_staff_reply_idx"
  ON "guest_ai_handoffs" ("first_staff_reply_at");
CREATE INDEX IF NOT EXISTS "guest_ai_handoffs_unread_guest_idx"
  ON "guest_ai_handoffs" ("guest_unread_count")
  WHERE "guest_unread_count" > 0;
CREATE INDEX IF NOT EXISTS "guest_ai_handoffs_unread_staff_idx"
  ON "guest_ai_handoffs" ("staff_unread_count")
  WHERE "staff_unread_count" > 0;

-- =============================================================================
-- 3) RLS — internal-only. Guests never query directly.
-- =============================================================================
ALTER TABLE "guest_ai_handoff_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guest_ai_handoff_replies" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_read ON "guest_ai_handoff_replies";
CREATE POLICY internal_read ON "guest_ai_handoff_replies"
  FOR SELECT USING (public.is_internal_user());

DROP POLICY IF EXISTS internal_write ON "guest_ai_handoff_replies";
CREATE POLICY internal_write ON "guest_ai_handoff_replies"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

COMMIT;
