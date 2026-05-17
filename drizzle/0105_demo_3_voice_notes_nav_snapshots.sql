-- DEMO-3 — Add the two genuinely missing tables identified by Phase A audit.
--
-- Most entities the DEMO-3 spec wanted to add already exist:
--   - qa_qc_inspections    → exists (qa-qc.ts L130)
--   - safety_incidents     → exists (site-operations.ts L722)
--   - documents            → exists (documents.ts L16)
--   - site_report_photos   → exists (site-operations.ts L350)
--   - rate_plans           → exists (pricing.ts L23)
--   - investor cluster     → exists (investor-capital.ts: investors,
--                            capital_commitments, capital_drawdowns,
--                            distributions, investor_wallets, wallet_transactions)
--   - channel sync         → channel_sync_log exists (channel-manager.ts L117)
--   - owner stay quotas    → owner_stay_policies handles allowance inline;
--                            no separate quota table needed
--
-- Genuinely missing:
--   - voice_notes              (field/site supervisor audio capture)
--   - investor_nav_snapshots   (quarterly per-project NAV)
--
-- All TENANT-1: organization_id NOT NULL FK + index.

BEGIN;

-- ----------------------------------------------------------------------------
-- voice_notes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "voice_notes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "site_report_id" UUID REFERENCES "site_reports"("id") ON DELETE SET NULL,
  "villa_id" UUID REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" UUID REFERENCES "projects"("id") ON DELETE SET NULL,
  "recorded_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "audio_url" TEXT,
  "duration_seconds" INTEGER,
  "transcript_text" TEXT,
  "transcript_language" TEXT,
  "transcribed_by_ai" BOOLEAN NOT NULL DEFAULT FALSE,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "voice_notes_org_idx"
  ON "voice_notes" ("organization_id");
CREATE INDEX IF NOT EXISTS "voice_notes_site_report_idx"
  ON "voice_notes" ("site_report_id");
CREATE INDEX IF NOT EXISTS "voice_notes_villa_idx"
  ON "voice_notes" ("villa_id");
CREATE INDEX IF NOT EXISTS "voice_notes_recorded_by_idx"
  ON "voice_notes" ("recorded_by");
CREATE INDEX IF NOT EXISTS "voice_notes_created_idx"
  ON "voice_notes" ("created_at");

-- ----------------------------------------------------------------------------
-- investor_nav_snapshots
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "investor_nav_snapshots" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "quarter_end_date" DATE NOT NULL,
  "nav_total_minor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "snapshot_notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "investor_nav_snapshots_currency_check"
    CHECK ("currency" IN ('USD','IDR','RUB','EUR','USDT','CNY')),
  CONSTRAINT "investor_nav_snapshots_project_quarter_unique"
    UNIQUE ("project_id", "quarter_end_date")
);

CREATE INDEX IF NOT EXISTS "investor_nav_snapshots_org_idx"
  ON "investor_nav_snapshots" ("organization_id");
CREATE INDEX IF NOT EXISTS "investor_nav_snapshots_project_idx"
  ON "investor_nav_snapshots" ("project_id");
CREATE INDEX IF NOT EXISTS "investor_nav_snapshots_quarter_idx"
  ON "investor_nav_snapshots" ("quarter_end_date");

COMMIT;
