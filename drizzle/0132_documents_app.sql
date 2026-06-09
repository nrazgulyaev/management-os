-- 0132 — Documents app v1.
-- Turns the flat documents metadata table into an interactive app:
--   * document_templates      — Generate-from-template source rows.
--   * document_versions       — per-document version history (version compare).
--   * document_signature_requests — e-sign request lifecycle (reminders / countersign).
-- Plus a small additive column on `documents` for the Feed-to-AI-agent flow.
-- Idempotent — safe to re-run.

-- ---------- Feed-to-AI flag on the existing documents table ----------
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ai_fed_at" timestamptz;

-- ---------- document_templates ----------
CREATE TABLE IF NOT EXISTS "document_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "document_type" text NOT NULL DEFAULT 'contract',
  "description" text,
  -- body with {{placeholder}} tokens; rendered at generate-time.
  "body" text NOT NULL DEFAULT '',
  -- default visibility applied to generated docs: internal | owner | guest | public
  "default_visibility" text NOT NULL DEFAULT 'internal',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "document_templates_active_idx" ON "document_templates" ("is_active");
CREATE INDEX IF NOT EXISTS "document_templates_type_idx" ON "document_templates" ("document_type");

-- ---------- document_versions ----------
CREATE TABLE IF NOT EXISTS "document_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE cascade,
  "version_no" integer NOT NULL DEFAULT 1,
  "title" text NOT NULL,
  -- snapshot of the file pointer + a content hash for compare.
  "storage_bucket" text,
  "storage_path" text,
  "file_name" text,
  "size_bytes" integer,
  "content_hash" text,
  -- free-text summary of what changed in this version.
  "change_note" text,
  "is_current" boolean NOT NULL DEFAULT false,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "document_versions_doc_idx" ON "document_versions" ("document_id", "version_no");
CREATE INDEX IF NOT EXISTS "document_versions_current_idx" ON "document_versions" ("document_id", "is_current");

-- ---------- document_signature_requests ----------
CREATE TABLE IF NOT EXISTS "document_signature_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE cascade,
  "signer_name" text NOT NULL,
  "signer_email" text,
  "signer_role" text NOT NULL DEFAULT 'owner',
  -- status: pending | sent | signed | countersigned | declined | cancelled
  "status" text NOT NULL DEFAULT 'pending',
  "message" text,
  "reminder_count" integer NOT NULL DEFAULT 0,
  "last_reminder_at" timestamptz,
  "sent_at" timestamptz,
  "signed_at" timestamptz,
  "countersigned_at" timestamptz,
  "requested_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "document_signature_requests_doc_idx" ON "document_signature_requests" ("document_id");
CREATE INDEX IF NOT EXISTS "document_signature_requests_status_idx" ON "document_signature_requests" ("status");
