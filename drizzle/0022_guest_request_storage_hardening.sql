-- =============================================================================
-- 0022 — Guest Request Storage Hardening (v9L).
--
-- Extends `guest_ai_handoff_reply_attachments` with columns for the
-- post-upload processing pipeline:
--   • EXIF / textual-metadata stripping for JPEG / PNG (PDF marked
--     `not_required`; WebP marked `warning` until a safe stripper
--     lands).
--   • Stale pending cleanup (24 h grace, then purge).
--   • A coarse security-scan flag for admin triage.
--
-- All columns are server-side internal only. The guest projection is
-- updated in code to only render rows where:
--   upload_status      = 'uploaded'
--   visibility         = 'guest_visible'
--   metadata_status    IN ('stripped','not_required','warning')
--   security_scan_status IN ('passed','warning')
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE "guest_ai_handoff_reply_attachments"
  ADD COLUMN IF NOT EXISTS "metadata_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "metadata_stripped_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "metadata_error" text,
  ADD COLUMN IF NOT EXISTS "original_size_bytes" bigint,
  ADD COLUMN IF NOT EXISTS "processed_size_bytes" bigint,
  ADD COLUMN IF NOT EXISTS "cleanup_eligible_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "deleted_reason" text,
  ADD COLUMN IF NOT EXISTS "security_scan_status" text NOT NULL DEFAULT 'not_scanned',
  ADD COLUMN IF NOT EXISTS "security_scan_notes" text;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_reply_attachments"
    ADD CONSTRAINT guest_ai_handoff_reply_attachments_metadata_status_check
    CHECK ("metadata_status" IN ('pending','stripped','not_required','warning','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_reply_attachments"
    ADD CONSTRAINT guest_ai_handoff_reply_attachments_security_scan_check
    CHECK ("security_scan_status" IN ('not_scanned','passed','warning','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "guest_ai_handoff_reply_attachments"
    ADD CONSTRAINT guest_ai_handoff_reply_attachments_deleted_reason_check
    CHECK (
      "deleted_reason" IS NULL OR "deleted_reason" IN (
        'stale_pending','guest_deleted','staff_deleted',
        'security_rejected','storage_missing'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "attachment_metadata_status_idx"
  ON "guest_ai_handoff_reply_attachments" ("metadata_status");
CREATE INDEX IF NOT EXISTS "attachment_cleanup_eligible_idx"
  ON "guest_ai_handoff_reply_attachments" ("cleanup_eligible_at")
  WHERE "cleanup_eligible_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "attachment_security_scan_status_idx"
  ON "guest_ai_handoff_reply_attachments" ("security_scan_status");

-- Pre-existing rows (created in v9K) get a sensible default:
--   PDF → not_required (no image metadata to strip)
--   image/* → pending (next admin sweep / register action will pick them up)
UPDATE "guest_ai_handoff_reply_attachments"
   SET "metadata_status" = 'not_required'
 WHERE "mime_type" = 'application/pdf'
   AND "metadata_status" = 'pending';

COMMIT;
