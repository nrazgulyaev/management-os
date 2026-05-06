-- =============================================================================
-- 0021 — Guest Request Attachments + Per-Message Read Receipts (v9K).
--
-- Adds:
--   • `guest_ai_handoff_reply_reads` — append-only per-message read
--     receipts. One row per (reply, reader_role, reader_principal).
--   • `guest_ai_handoff_reply_attachments` — Supabase-Storage-backed
--     file uploads per reply. We store ONLY `storage_path`; never a
--     public URL. Listing mints short-lived signed download URLs at
--     read time.
--
-- Internal-only at the DB layer. Guest access goes through
-- token-scoped server actions; the storage path itself is never
-- projected to a guest response.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) guest_ai_handoff_reply_reads
CREATE TABLE IF NOT EXISTS "guest_ai_handoff_reply_reads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reply_id" uuid NOT NULL
    REFERENCES "guest_ai_handoff_replies"("id") ON DELETE CASCADE,
  "handoff_id" uuid NOT NULL
    REFERENCES "guest_ai_handoffs"("id") ON DELETE CASCADE,
  "reader_type" text NOT NULL,
  "reader_app_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reader_token_id" uuid REFERENCES "guest_stay_tokens"("id") ON DELETE CASCADE,
  "read_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_reply_reads"
    ADD CONSTRAINT guest_ai_handoff_reply_reads_reader_type_check
    CHECK ("reader_type" IN ('guest','staff'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One read row per (reply, reader_type, principal). Principal is the
-- staff app_user UUID for staff or the stay-token UUID for guest. We
-- COALESCE both into a single "principal" key so the unique index
-- works across the two types without NULL ambiguity.
CREATE UNIQUE INDEX IF NOT EXISTS "guest_ai_handoff_reply_reads_principal_unique"
  ON "guest_ai_handoff_reply_reads" (
    "reply_id",
    "reader_type",
    COALESCE(
      "reader_app_user_id",
      "reader_token_id",
      '00000000-0000-0000-0000-000000000000'::uuid
    )
  );

CREATE INDEX IF NOT EXISTS "guest_ai_handoff_reply_reads_reply_idx"
  ON "guest_ai_handoff_reply_reads" ("reply_id");
CREATE INDEX IF NOT EXISTS "guest_ai_handoff_reply_reads_handoff_idx"
  ON "guest_ai_handoff_reply_reads" ("handoff_id");
CREATE INDEX IF NOT EXISTS "guest_ai_handoff_reply_reads_reader_idx"
  ON "guest_ai_handoff_reply_reads" (
    "reader_type",
    "reader_app_user_id",
    "reader_token_id"
  );
CREATE INDEX IF NOT EXISTS "guest_ai_handoff_reply_reads_read_at_idx"
  ON "guest_ai_handoff_reply_reads" ("read_at" DESC);

-- 2) guest_ai_handoff_reply_attachments
CREATE TABLE IF NOT EXISTS "guest_ai_handoff_reply_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reply_id" uuid NOT NULL
    REFERENCES "guest_ai_handoff_replies"("id") ON DELETE CASCADE,
  "handoff_id" uuid NOT NULL
    REFERENCES "guest_ai_handoffs"("id") ON DELETE CASCADE,
  "service_request_id" uuid
    REFERENCES "service_requests"("id") ON DELETE SET NULL,
  "storage_bucket" text NOT NULL DEFAULT 'guest-request-attachments',
  "storage_path" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "uploaded_by_type" text NOT NULL,
  "uploaded_by_app_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "uploaded_by_token_id" uuid REFERENCES "guest_stay_tokens"("id") ON DELETE CASCADE,
  "upload_status" text NOT NULL DEFAULT 'pending',
  "visibility" text NOT NULL DEFAULT 'guest_visible',
  "image_width" integer,
  "image_height" integer,
  "checksum_sha256" text,
  "signed_url_expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "uploaded_at" timestamptz,
  "deleted_at" timestamptz
);

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_reply_attachments"
    ADD CONSTRAINT guest_ai_handoff_reply_attachments_uploader_check
    CHECK ("uploaded_by_type" IN ('guest','staff'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_reply_attachments"
    ADD CONSTRAINT guest_ai_handoff_reply_attachments_status_check
    CHECK ("upload_status" IN ('pending','uploaded','failed','deleted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_reply_attachments"
    ADD CONSTRAINT guest_ai_handoff_reply_attachments_visibility_check
    CHECK ("visibility" IN ('guest_visible','internal_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_reply_attachments"
    ADD CONSTRAINT guest_ai_handoff_reply_attachments_mime_check
    CHECK ("mime_type" IN (
      'image/jpeg','image/png','image/webp','application/pdf'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_reply_attachments"
    ADD CONSTRAINT guest_ai_handoff_reply_attachments_size_check
    CHECK ("size_bytes" >= 1 AND "size_bytes" <= 8 * 1024 * 1024);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_ai_handoff_reply_attachments_reply_idx"
  ON "guest_ai_handoff_reply_attachments" ("reply_id");
CREATE INDEX IF NOT EXISTS "guest_ai_handoff_reply_attachments_handoff_idx"
  ON "guest_ai_handoff_reply_attachments" ("handoff_id");
CREATE INDEX IF NOT EXISTS "guest_ai_handoff_reply_attachments_status_idx"
  ON "guest_ai_handoff_reply_attachments" ("upload_status");
CREATE INDEX IF NOT EXISTS "guest_ai_handoff_reply_attachments_visibility_idx"
  ON "guest_ai_handoff_reply_attachments" ("visibility");
CREATE UNIQUE INDEX IF NOT EXISTS "guest_ai_handoff_reply_attachments_storage_unique"
  ON "guest_ai_handoff_reply_attachments" ("storage_bucket", "storage_path");

-- =============================================================================
-- 3) RLS — every new table is internal-only. Guest paths use the
-- service-role client through token-scoped server actions.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'guest_ai_handoff_reply_reads',
      'guest_ai_handoff_reply_attachments'
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
