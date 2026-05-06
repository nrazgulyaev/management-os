-- =============================================================================
-- 0015 — Guest stay production foundation (v9E).
--
-- Adds tokenised guest access (`guest_stay_tokens` + `guest_stay_access_events`),
-- editable villa guide content (`villa_guide_sections`, `villa_wifi_credentials`,
-- `villa_emergency_contacts`, `villa_neighborhood_places`), and a smart-lock
-- code stub (`smart_lock_access_codes`). NO real lock APIs are called — the
-- stub generates a deterministic-looking 6-digit display only.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) guest_stay_tokens — one row per issued token. We store the SHA-256 hash
-- only; the prefix (first ~8 chars) is kept plaintext for admin display so
-- operators can identify a token without reading the secret.
CREATE TABLE IF NOT EXISTS "guest_stay_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "token_prefix" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "issued_to_email" text,
  "issued_to_phone" text,
  "expires_at" timestamptz NOT NULL,
  "last_accessed_at" timestamptz,
  "access_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "revoked_at" timestamptz,
  "revoke_reason" text
);

DO $$ BEGIN
  ALTER TABLE "guest_stay_tokens"
    ADD CONSTRAINT guest_stay_tokens_status_check
    CHECK ("status" IN ('active', 'revoked', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_stay_tokens_booking_idx"
  ON "guest_stay_tokens" ("booking_id");
CREATE INDEX IF NOT EXISTS "guest_stay_tokens_status_idx"
  ON "guest_stay_tokens" ("status");
CREATE INDEX IF NOT EXISTS "guest_stay_tokens_expires_idx"
  ON "guest_stay_tokens" ("expires_at");

-- 2) guest_stay_access_events — append-only access log. ip_hash is a
-- truncated hash, never the raw IP, so operators can spot reuse without
-- holding PII.
CREATE TABLE IF NOT EXISTS "guest_stay_access_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "guest_stay_token_id" uuid REFERENCES "guest_stay_tokens"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "ip_hash" text,
  "user_agent" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "guest_stay_access_events"
    ADD CONSTRAINT guest_stay_access_events_type_check
    CHECK ("event_type" IN (
      'opened',
      'invalid_token',
      'expired_token',
      'revoked_token',
      'service_request_created',
      'guide_opened',
      'smart_lock_viewed',
      'wifi_viewed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_stay_access_events_token_idx"
  ON "guest_stay_access_events" ("guest_stay_token_id");
CREATE INDEX IF NOT EXISTS "guest_stay_access_events_booking_idx"
  ON "guest_stay_access_events" ("booking_id");
CREATE INDEX IF NOT EXISTS "guest_stay_access_events_type_idx"
  ON "guest_stay_access_events" ("event_type");
CREATE INDEX IF NOT EXISTS "guest_stay_access_events_created_idx"
  ON "guest_stay_access_events" ("created_at" DESC);

-- 3) villa_guide_sections — editable guest-facing content. A villa-scoped
-- row beats a project-scoped row at the same `section_key`.
CREATE TABLE IF NOT EXISTS "villa_guide_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "section_key" text NOT NULL,
  "title" text NOT NULL,
  "body_md" text,
  "body_json" jsonb,
  "sort_order" integer NOT NULL DEFAULT 0,
  "guest_visible" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'active',
  "updated_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "villa_guide_sections"
    ADD CONSTRAINT villa_guide_sections_status_check
    CHECK ("status" IN ('active', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "villa_guide_sections"
    ADD CONSTRAINT villa_guide_sections_section_key_check
    CHECK ("section_key" IN (
      'check_in', 'wifi', 'house_rules', 'appliances',
      'amenities', 'neighborhood', 'transport', 'emergency', 'offline_pdf',
      'general'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Partial unique indexes — at most one row per (villa, section_key) for
-- villa-scoped, and one per (project, section_key) for project-scoped.
CREATE UNIQUE INDEX IF NOT EXISTS "villa_guide_sections_villa_unique"
  ON "villa_guide_sections" ("villa_id", "section_key")
  WHERE "villa_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "villa_guide_sections_project_unique"
  ON "villa_guide_sections" ("project_id", "section_key")
  WHERE "villa_id" IS NULL AND "project_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "villa_guide_sections_status_idx"
  ON "villa_guide_sections" ("status");

-- 4) villa_wifi_credentials — guest-visible Wi-Fi. `display_password` is a
-- TEMPORARY plaintext field documented as a v9F upgrade target. Any future
-- encryption flow can populate `password_encrypted` and ignore the
-- plaintext column.
CREATE TABLE IF NOT EXISTS "villa_wifi_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "network_name" text NOT NULL,
  "password_encrypted" text,
  "display_password" text,
  "instructions_md" text,
  "status" text NOT NULL DEFAULT 'active',
  "updated_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "villa_wifi_credentials"
    ADD CONSTRAINT villa_wifi_credentials_status_check
    CHECK ("status" IN ('active', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "villa_wifi_credentials_villa_idx"
  ON "villa_wifi_credentials" ("villa_id");
CREATE INDEX IF NOT EXISTS "villa_wifi_credentials_project_idx"
  ON "villa_wifi_credentials" ("project_id");

-- 5) villa_emergency_contacts — guest-visible safety contacts.
CREATE TABLE IF NOT EXISTS "villa_emergency_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "contact_type" text NOT NULL,
  "phone" text,
  "whatsapp" text,
  "email" text,
  "address" text,
  "notes_md" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "guest_visible" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "villa_emergency_contacts"
    ADD CONSTRAINT villa_emergency_contacts_type_check
    CHECK ("contact_type" IN (
      'manager', 'concierge', 'emergency', 'hospital',
      'police', 'fire', 'security', 'maintenance', 'driver', 'other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "villa_emergency_contacts"
    ADD CONSTRAINT villa_emergency_contacts_status_check
    CHECK ("status" IN ('active', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "villa_emergency_contacts_villa_idx"
  ON "villa_emergency_contacts" ("villa_id");
CREATE INDEX IF NOT EXISTS "villa_emergency_contacts_project_idx"
  ON "villa_emergency_contacts" ("project_id");
CREATE INDEX IF NOT EXISTS "villa_emergency_contacts_type_idx"
  ON "villa_emergency_contacts" ("contact_type");

-- 6) villa_neighborhood_places — restaurants, beaches, transport, etc.
CREATE TABLE IF NOT EXISTS "villa_neighborhood_places" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description_md" text,
  "address" text,
  "google_maps_url" text,
  "distance_label" text,
  "travel_time_label" text,
  "image_url" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "guest_visible" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "villa_neighborhood_places"
    ADD CONSTRAINT villa_neighborhood_places_category_check
    CHECK ("category" IN (
      'restaurant', 'cafe', 'beach', 'gym', 'spa',
      'supermarket', 'pharmacy', 'hospital', 'attraction',
      'nightlife', 'coworking', 'transport', 'other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "villa_neighborhood_places"
    ADD CONSTRAINT villa_neighborhood_places_status_check
    CHECK ("status" IN ('active', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "villa_neighborhood_places_villa_idx"
  ON "villa_neighborhood_places" ("villa_id");
CREATE INDEX IF NOT EXISTS "villa_neighborhood_places_project_idx"
  ON "villa_neighborhood_places" ("project_id");
CREATE INDEX IF NOT EXISTS "villa_neighborhood_places_category_idx"
  ON "villa_neighborhood_places" ("category");

-- 7) smart_lock_access_codes — stub. v9E generates a deterministic-looking
-- 6-digit display tied to (booking_id, villa_id) so demo flows work; the
-- column is named `code_display` to make the boundary obvious. A future
-- v9F+ integration writes `code_hash` + a real `source` value.
CREATE TABLE IF NOT EXISTS "smart_lock_access_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "code_hash" text,
  "code_display" text,
  "valid_from" timestamptz NOT NULL,
  "valid_until" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "source" text NOT NULL DEFAULT 'stub',
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "revoked_at" timestamptz
);

DO $$ BEGIN
  ALTER TABLE "smart_lock_access_codes"
    ADD CONSTRAINT smart_lock_access_codes_status_check
    CHECK ("status" IN ('active', 'revoked', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "smart_lock_access_codes"
    ADD CONSTRAINT smart_lock_access_codes_source_check
    CHECK ("source" IN ('stub', 'manual', 'aqara', 'igloohome', 'ttlock', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "smart_lock_access_codes"
    ADD CONSTRAINT smart_lock_access_codes_validity_check
    CHECK ("valid_until" > "valid_from");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One active stub per booking — re-issuing replaces the previous one.
CREATE UNIQUE INDEX IF NOT EXISTS "smart_lock_access_codes_booking_active_unique"
  ON "smart_lock_access_codes" ("booking_id")
  WHERE "status" = 'active';

CREATE INDEX IF NOT EXISTS "smart_lock_access_codes_booking_idx"
  ON "smart_lock_access_codes" ("booking_id");
CREATE INDEX IF NOT EXISTS "smart_lock_access_codes_villa_idx"
  ON "smart_lock_access_codes" ("villa_id");
CREATE INDEX IF NOT EXISTS "smart_lock_access_codes_status_idx"
  ON "smart_lock_access_codes" ("status");

-- =============================================================================
-- 8) RLS — every new table is internal-only. The guest route reads through
-- a server resolver, never directly. RLS keeps owners + guests out at the
-- DB layer regardless of any future code path.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'guest_stay_tokens',
      'guest_stay_access_events',
      'villa_guide_sections',
      'villa_wifi_credentials',
      'villa_emergency_contacts',
      'villa_neighborhood_places',
      'smart_lock_access_codes'
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
  END LOOP;
END $$;

-- Token + lock tables get explicit internal_write policies too — the
-- guest-route resolver runs on the service role and bypasses RLS, but
-- direct admin updates must still go through internal users.
DROP POLICY IF EXISTS internal_write ON "guest_stay_tokens";
CREATE POLICY internal_write ON "guest_stay_tokens"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS internal_write ON "smart_lock_access_codes";
CREATE POLICY internal_write ON "smart_lock_access_codes"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

COMMIT;
