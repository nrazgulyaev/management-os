-- =============================================================================
-- 0035 — Development OS · Stage 2.2.A
--   Contacts foundation + lead pipeline + AI Sales Assistant scaffolding.
--
-- Five new tables plus a backfill of `land_plots.owner_contact_name` into
-- normalized contacts. Idempotent: every CREATE uses IF NOT EXISTS, every
-- constraint wrapped in DO $$ ... EXCEPTION WHEN duplicate_object, and the
-- backfill checks NOT EXISTS before inserting.
--
-- See docs/development-os-architecture.md for the long-running schema
-- contract and the rationale for the contact normalization decision.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) contacts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "full_name" text NOT NULL,
  "display_name" text,
  "email" text,
  "phone" text,
  "whatsapp" text,
  "preferred_language" text NOT NULL DEFAULT 'en',
  "preferred_communication_channel" text,
  "country_of_residence" text,
  "citizenship" text,
  "tax_residency" text,
  "acquisition_source" text,
  "acquisition_source_detail" text,
  "linked_guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "linked_owner_id" uuid REFERENCES "owners"("id") ON DELETE SET NULL,
  "linked_app_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "notes" text,
  "is_archived" boolean NOT NULL DEFAULT false,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "contacts"
    ADD CONSTRAINT contacts_communication_channel_check
    CHECK ("preferred_communication_channel" IS NULL
      OR "preferred_communication_channel" IN ('email','whatsapp','phone','in_person'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contacts"
    ADD CONSTRAINT contacts_acquisition_source_check
    CHECK ("acquisition_source" IS NULL
      OR "acquisition_source" IN ('website','instagram','meta_ads','agent','referral','cold','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "contacts_email_lower_idx"
  ON "contacts" (lower("email")) WHERE "email" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "contacts_phone_idx"
  ON "contacts" ("phone") WHERE "phone" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "contacts_acquisition_source_idx"
  ON "contacts" ("acquisition_source") WHERE "is_archived" = false;

-- -----------------------------------------------------------------------------
-- 2) agents (one row per contact who is also a sales agent)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" uuid NOT NULL UNIQUE REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "agency_name" text,
  "agreement_signed_at" date,
  "agreement_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "default_commission_percent" numeric(6, 3),
  "default_commission_structure" text,
  "agreement_status" text NOT NULL DEFAULT 'draft',
  "agreement_notes" text,
  "is_preferred_partner" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "agents"
    ADD CONSTRAINT agents_agreement_status_check
    CHECK ("agreement_status" IN ('draft','active','paused','terminated'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agents"
    ADD CONSTRAINT agents_commission_structure_check
    CHECK ("default_commission_structure" IS NULL
      OR "default_commission_structure" IN ('percent_of_sale','flat_fee','tiered'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "agents_status_active_idx"
  ON "agents" ("agreement_status") WHERE "agreement_status" = 'active';

-- -----------------------------------------------------------------------------
-- 3) lead_sources
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "lead_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_code" text NOT NULL UNIQUE,
  "source_category" text NOT NULL DEFAULT 'other',
  "campaign_name" text,
  "agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "lead_sources"
    ADD CONSTRAINT lead_sources_category_check
    CHECK ("source_category" IN ('website','paid_ads','organic_social','agent','referral','event','cold','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "lead_sources_category_active_idx"
  ON "lead_sources" ("source_category") WHERE "is_active" = true;

-- -----------------------------------------------------------------------------
-- 4) contact_roles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contact_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "role" text NOT NULL,
  "scope" text NOT NULL DEFAULT 'global',
  "scope_project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "scope_unit_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'new',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  "end_reason" text,
  "assigned_to" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "source_id" uuid REFERENCES "lead_sources"("id") ON DELETE SET NULL,
  "agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "unit_type_interest_id" uuid REFERENCES "unit_types"("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "contact_roles"
    ADD CONSTRAINT contact_roles_role_check
    CHECK ("role" IN ('lead','buyer','investor','owner','agent','tenant','landowner','vendor','employee'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_roles"
    ADD CONSTRAINT contact_roles_scope_check
    CHECK ("scope" IN ('global','project','unit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_roles"
    ADD CONSTRAINT contact_roles_scope_project_check
    CHECK (
      ("scope" = 'global')
      OR ("scope" = 'project' AND "scope_project_id" IS NOT NULL)
      OR ("scope" = 'unit' AND "scope_project_id" IS NOT NULL AND "scope_unit_id" IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_roles"
    ADD CONSTRAINT contact_roles_end_reason_check
    CHECK ("end_reason" IS NULL OR "end_reason" IN ('converted','lost','completed','transferred'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "contact_roles_contact_idx"
  ON "contact_roles" ("contact_id");
CREATE INDEX IF NOT EXISTS "contact_roles_role_status_idx"
  ON "contact_roles" ("role", "status");
CREATE INDEX IF NOT EXISTS "contact_roles_project_idx"
  ON "contact_roles" ("scope_project_id");
CREATE INDEX IF NOT EXISTS "contact_roles_assigned_active_idx"
  ON "contact_roles" ("assigned_to") WHERE "ended_at" IS NULL;

-- At most one active role of a kind per project per contact.
CREATE UNIQUE INDEX IF NOT EXISTS "contact_roles_active_unique"
  ON "contact_roles" ("contact_id", "role", "scope_project_id")
  WHERE "ended_at" IS NULL;

-- -----------------------------------------------------------------------------
-- 5) contact_interactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contact_interactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "interaction_type" text NOT NULL,
  "direction" text NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "duration_seconds" integer,
  "subject" text,
  "body" text,
  "document_ids" jsonb,

  "ai_summary" text,
  "ai_sentiment" text,
  "ai_action_items" jsonb,
  "ai_generated_at" timestamptz,
  "ai_model" text,
  "ai_run_id" uuid REFERENCES "ai_assistant_runs"("id") ON DELETE SET NULL,

  "review_status" text NOT NULL DEFAULT 'not_required',
  "reviewed_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "review_notes" text,

  "related_role_id" uuid REFERENCES "contact_roles"("id") ON DELETE SET NULL,
  "follow_up_required" boolean NOT NULL DEFAULT false,
  "follow_up_due_at" timestamptz,
  "follow_up_assigned_to" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "follow_up_completed" boolean NOT NULL DEFAULT false,

  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "contact_interactions"
    ADD CONSTRAINT contact_interactions_type_check
    CHECK ("interaction_type" IN (
      'call','whatsapp_message','whatsapp_voice','email_in','email_out',
      'zoom_meeting','site_meeting','sms','in_person','note',
      'system_event','ai_draft'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_interactions"
    ADD CONSTRAINT contact_interactions_direction_check
    CHECK ("direction" IN ('inbound','outbound','internal_note'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_interactions"
    ADD CONSTRAINT contact_interactions_sentiment_check
    CHECK ("ai_sentiment" IS NULL
      OR "ai_sentiment" IN ('positive','neutral','negative','urgent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_interactions"
    ADD CONSTRAINT contact_interactions_review_status_check
    CHECK ("review_status" IN ('not_required','pending','approved','rejected','sent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "contact_interactions_contact_at_idx"
  ON "contact_interactions" ("contact_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "contact_interactions_project_at_idx"
  ON "contact_interactions" ("project_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "contact_interactions_followup_due_idx"
  ON "contact_interactions" ("follow_up_due_at")
  WHERE "follow_up_required" = true AND "follow_up_completed" = false;
CREATE INDEX IF NOT EXISTS "contact_interactions_review_pending_idx"
  ON "contact_interactions" ("review_status")
  WHERE "review_status" = 'pending';

-- -----------------------------------------------------------------------------
-- 6) Backfill: land_plots.owner_contact_name → contacts + contact_roles
--    Adds new column land_plots.owner_contact_id and populates it.
--    Original column kept for one sub-stage as backwards compatibility.
-- -----------------------------------------------------------------------------
ALTER TABLE "land_plots"
  ADD COLUMN IF NOT EXISTS "owner_contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL;

COMMENT ON COLUMN "land_plots"."owner_contact_name"
  IS 'DEPRECATED in 2.2.A — kept for backwards compatibility. Drop scheduled for Stage 2.4. New code reads owner_contact_id.';

-- For each distinct (project_id, owner_contact_name), insert one contact row.
-- Idempotent: only inserts when no contact with that exact full_name exists yet
-- and the plot's owner_contact_id is still null.
INSERT INTO "contacts" ("full_name", "acquisition_source", "notes")
SELECT DISTINCT
  lp."owner_contact_name",
  'referral',
  'Auto-created by 0035 backfill from land_plots.owner_contact_name'
FROM "land_plots" lp
WHERE lp."owner_contact_name" IS NOT NULL
  AND lp."owner_contact_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "contacts" c
    WHERE c."full_name" = lp."owner_contact_name"
      AND c."notes" = 'Auto-created by 0035 backfill from land_plots.owner_contact_name'
  );

-- Wire each plot to its newly-minted contact.
UPDATE "land_plots" lp
SET "owner_contact_id" = c."id"
FROM "contacts" c
WHERE lp."owner_contact_name" IS NOT NULL
  AND lp."owner_contact_id" IS NULL
  AND c."full_name" = lp."owner_contact_name"
  AND c."notes" = 'Auto-created by 0035 backfill from land_plots.owner_contact_name';

-- Mint a 'landowner' contact_role per (contact, project). Idempotent via the
-- partial unique index contact_roles_active_unique.
INSERT INTO "contact_roles" (
  "contact_id", "role", "scope", "scope_project_id", "status", "started_at", "notes"
)
SELECT
  lp."owner_contact_id",
  'landowner',
  'project',
  lp."project_id",
  'active',
  COALESCE(lp."acquisition_date"::timestamptz, now()),
  'Auto-created by 0035 backfill'
FROM "land_plots" lp
WHERE lp."owner_contact_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "contact_roles" cr
    WHERE cr."contact_id" = lp."owner_contact_id"
      AND cr."role" = 'landowner'
      AND cr."scope_project_id" = lp."project_id"
      AND cr."ended_at" IS NULL
  );

-- -----------------------------------------------------------------------------
-- 7) RLS — internal-only read/write on every new table.
--    Mirrors the 0034 pattern. `public.is_internal_user()` is defined in
--    0000_initial.sql.
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'contacts',
      'agents',
      'lead_sources',
      'contact_roles',
      'contact_interactions'
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
