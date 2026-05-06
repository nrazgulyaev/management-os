-- =============================================================================
-- 0075 — Development OS · Stage 6.P0.7 — Bulk Import + OAuth Foundation
--
-- 2 new tables:
--   - bulk_import_jobs   tracks CSV/XLSX/Sheets/JSON imports per organization,
--                        with per-job source file, field mapping, status FSM,
--                        progress counters, error log, and the ids of created
--                        entities (for audit + rollback ergonomics).
--   - oauth_connections  per-(org,user,provider,account) OAuth tokens for
--                        upstream services like Google Sheets / Drive. Tokens
--                        are encrypted at the application layer using
--                        STAY_LINK_KMS_SECRET (the same envelope we already
--                        use for guest-stay tokens).
--
-- Both tables are per-organization, RLS-protected via the existing
-- is_in_user_organization() helper from migration 0071. Idempotent.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) bulk_import_jobs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "bulk_import_jobs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "job_code" TEXT NOT NULL UNIQUE,
  "entity_type" TEXT NOT NULL CHECK ("entity_type" IN (
    'transactions', 'contacts', 'vendors', 'buyers',
    'investors', 'materials', 'inventory_items',
    'site_reports', 'qa_qc_issues', 'leads',
    'reservations', 'invoices', 'tasks'
  )),
  "source_type" TEXT NOT NULL CHECK ("source_type" IN (
    'csv', 'xlsx', 'google_sheets', 'json'
  )),
  "source_filename" TEXT,
  "source_size_bytes" BIGINT,
  "source_document_id" UUID REFERENCES "documents"("id") ON DELETE SET NULL,
  -- Inline source storage: CSV/JSON content as text, XLSX as base64.
  -- Cron processor reads from this to parse + insert in batches. The
  -- `source_document_id` column above is reserved for future iterations
  -- that need replay/audit + storage-provider integration.
  "source_content" TEXT,
  "field_mapping" JSONB NOT NULL,
  -- Set when the wizard's "Save mapping as…" template option is used.
  "save_mapping_as" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN (
    'pending', 'validating', 'ready', 'processing',
    'completed', 'failed', 'cancelled'
  )),
  "total_rows" INTEGER,
  "processed_rows" INTEGER NOT NULL DEFAULT 0,
  "successful_rows" INTEGER NOT NULL DEFAULT 0,
  "failed_rows" INTEGER NOT NULL DEFAULT 0,
  "error_log" JSONB,
  "created_entity_ids" UUID[],
  "initiated_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "initiated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "validated_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "bulk_import_jobs_org_idx"
  ON "bulk_import_jobs"("organization_id");
CREATE INDEX IF NOT EXISTS "bulk_import_jobs_status_idx"
  ON "bulk_import_jobs"("status");
CREATE INDEX IF NOT EXISTS "bulk_import_jobs_initiated_idx"
  ON "bulk_import_jobs"("initiated_at" DESC);

CREATE OR REPLACE FUNCTION "bulk_import_jobs_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_bulk_import_jobs_updated_at" ON "bulk_import_jobs";
CREATE TRIGGER "trg_bulk_import_jobs_updated_at"
  BEFORE UPDATE ON "bulk_import_jobs"
  FOR EACH ROW EXECUTE FUNCTION "bulk_import_jobs_set_updated_at"();

-- -----------------------------------------------------------------------------
-- 2) oauth_connections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "oauth_connections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL,
  "account_email" TEXT,
  "account_name" TEXT,
  -- Encrypted at the application layer (Web Crypto AES-GCM, key derived
  -- from STAY_LINK_KMS_SECRET). Never store plaintext.
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT,
  "expires_at" TIMESTAMPTZ,
  "scopes" TEXT[],
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_used_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_connections_org_user_provider_account_unique"
  ON "oauth_connections"("organization_id", "user_id", "provider", "account_email")
  WHERE "account_email" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "oauth_connections_org_user_idx"
  ON "oauth_connections"("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "oauth_connections_active_idx"
  ON "oauth_connections"("is_active") WHERE "is_active" = TRUE;

CREATE OR REPLACE FUNCTION "oauth_connections_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_oauth_connections_updated_at" ON "oauth_connections";
CREATE TRIGGER "trg_oauth_connections_updated_at"
  BEFORE UPDATE ON "oauth_connections"
  FOR EACH ROW EXECUTE FUNCTION "oauth_connections_set_updated_at"();

-- -----------------------------------------------------------------------------
-- 3) RLS — per-org isolation via is_in_user_organization() (Stage 5.J helper)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['bulk_import_jobs', 'oauth_connections'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS org_isolation ON %I; '
      'CREATE POLICY org_isolation ON %I FOR ALL '
      'USING (public.is_in_user_organization(organization_id)) '
      'WITH CHECK (public.is_in_user_organization(organization_id));',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
