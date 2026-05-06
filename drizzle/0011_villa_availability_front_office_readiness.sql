-- =============================================================================
-- 0011 — Villa availability, front office, readiness, responsibility scopes,
-- and security-camera registry (V9A).
--
-- Adds the master calendar primitive (`villa_calendar_blocks`), the readiness
-- timeline (`villa_readiness_states`), front-office events (`booking_stay_events`,
-- `checkin_checkout_requests`), responsibility scoping (`user_responsibility_scopes`),
-- and a registry-only camera table (`security_camera_devices`).
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) New system role: booking_manager (front-office focused). Idempotent.
INSERT INTO roles (key, name, description, is_system) VALUES
  ('booking_manager', 'Booking Manager', 'Front office, arrivals/departures, availability', true)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 2) villa_calendar_blocks — master availability primitive.
CREATE TABLE IF NOT EXISTS "villa_calendar_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "block_type" text NOT NULL,
  "source_type" text,
  "source_id" uuid,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'active',
  "owner_visible" boolean NOT NULL DEFAULT false,
  "guest_visible" boolean NOT NULL DEFAULT false,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "villa_calendar_blocks"
    ADD CONSTRAINT villa_calendar_blocks_block_type_check
    CHECK ("block_type" IN (
      'guest_booking','owner_stay','maintenance_block','deep_cleaning',
      'inspection','out_of_order','internal_hold','channel_hold'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "villa_calendar_blocks"
    ADD CONSTRAINT villa_calendar_blocks_status_check
    CHECK ("status" IN ('active','cancelled','completed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "villa_calendar_blocks"
    ADD CONSTRAINT villa_calendar_blocks_time_check
    CHECK ("ends_at" > "starts_at");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "villa_calendar_blocks_villa_idx"
  ON "villa_calendar_blocks" ("villa_id", "starts_at");
CREATE INDEX IF NOT EXISTS "villa_calendar_blocks_status_idx"
  ON "villa_calendar_blocks" ("status");
CREATE INDEX IF NOT EXISTS "villa_calendar_blocks_block_type_idx"
  ON "villa_calendar_blocks" ("block_type");
CREATE INDEX IF NOT EXISTS "villa_calendar_blocks_source_idx"
  ON "villa_calendar_blocks" ("source_type", "source_id");
-- One active block per (source_type, source_id) — keeps booking <-> block sync
-- idempotent. Cancelled rows are excluded so historical sync is preserved.
CREATE UNIQUE INDEX IF NOT EXISTS "villa_calendar_blocks_source_unique"
  ON "villa_calendar_blocks" ("source_type", "source_id")
  WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL AND "status" = 'active';

-- 3) villa_readiness_states — append-only timeline; "current" is the row with
--    NULL effective_to.
CREATE TABLE IF NOT EXISTS "villa_readiness_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "readiness_status" text NOT NULL DEFAULT 'unknown',
  "effective_from" timestamptz NOT NULL DEFAULT now(),
  "effective_to" timestamptz,
  "related_booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "related_task_id" uuid REFERENCES "operation_tasks"("id") ON DELETE SET NULL,
  "notes" text,
  "changed_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "villa_readiness_states"
    ADD CONSTRAINT villa_readiness_states_status_check
    CHECK ("readiness_status" IN (
      'unknown','dirty','cleaning','inspection','ready','occupied',
      'maintenance_block','out_of_order'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "villa_readiness_states_villa_idx"
  ON "villa_readiness_states" ("villa_id", "effective_from" DESC);
CREATE INDEX IF NOT EXISTS "villa_readiness_states_status_idx"
  ON "villa_readiness_states" ("readiness_status");
-- At most one open ("effective_to IS NULL") row per villa — partial unique
-- index. The service layer closes the previous row before inserting a new one.
CREATE UNIQUE INDEX IF NOT EXISTS "villa_readiness_states_open_unique"
  ON "villa_readiness_states" ("villa_id")
  WHERE "effective_to" IS NULL;

-- 4) booking_stay_events — front-office event ledger per booking.
CREATE TABLE IF NOT EXISTS "booking_stay_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "event_at" timestamptz NOT NULL DEFAULT now(),
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "booking_stay_events"
    ADD CONSTRAINT booking_stay_events_event_type_check
    CHECK ("event_type" IN (
      'pre_arrival','arrival_due','checked_in','in_house','checkout_due',
      'expected_checkout_updated','checked_out','no_show','cancelled'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "booking_stay_events_booking_idx"
  ON "booking_stay_events" ("booking_id", "event_at" DESC);
CREATE INDEX IF NOT EXISTS "booking_stay_events_type_idx"
  ON "booking_stay_events" ("event_type");

-- 5) checkin_checkout_requests — early/late checkout, expected-checkout-time.
CREATE TABLE IF NOT EXISTS "checkin_checkout_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "request_type" text NOT NULL,
  "requested_time" timestamptz,
  "status" text NOT NULL DEFAULT 'requested',
  "fee_amount_minor" bigint,
  "currency" text,
  "admin_notes" text,
  "guest_message" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reviewed_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "checkin_checkout_requests"
    ADD CONSTRAINT checkin_checkout_requests_type_check
    CHECK ("request_type" IN (
      'early_checkin','late_checkout','expected_checkout_time','early_checkout_notice'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "checkin_checkout_requests"
    ADD CONSTRAINT checkin_checkout_requests_status_check
    CHECK ("status" IN ('requested','reviewing','approved','rejected','cancelled','completed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "checkin_checkout_requests_booking_idx"
  ON "checkin_checkout_requests" ("booking_id");
CREATE INDEX IF NOT EXISTS "checkin_checkout_requests_status_idx"
  ON "checkin_checkout_requests" ("status");

-- 6) user_responsibility_scopes — fine-grained "who is on the hook" mapping.
CREATE TABLE IF NOT EXISTS "user_responsibility_scopes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "role_key" text,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "task_category" text,
  "scope_type" text NOT NULL DEFAULT 'operations',
  "status" text NOT NULL DEFAULT 'active',
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "user_responsibility_scopes"
    ADD CONSTRAINT user_responsibility_scopes_scope_type_check
    CHECK ("scope_type" IN (
      'operations','housekeeping','maintenance','front_office','security','procurement','finance'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user_responsibility_scopes"
    ADD CONSTRAINT user_responsibility_scopes_status_check
    CHECK ("status" IN ('active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "user_responsibility_scopes_user_idx"
  ON "user_responsibility_scopes" ("user_id");
CREATE INDEX IF NOT EXISTS "user_responsibility_scopes_villa_idx"
  ON "user_responsibility_scopes" ("villa_id");
CREATE INDEX IF NOT EXISTS "user_responsibility_scopes_project_idx"
  ON "user_responsibility_scopes" ("project_id");
CREATE INDEX IF NOT EXISTS "user_responsibility_scopes_scope_idx"
  ON "user_responsibility_scopes" ("scope_type", "status");

-- 7) security_camera_devices — registry only. NO video stream metadata is
--    served from this app; the app simply links out to a vendor portal.
CREATE TABLE IF NOT EXISTS "security_camera_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "location_label" text NOT NULL,
  "provider" text,
  "external_app_url" text,
  "stream_url_encrypted" text,
  "status" text NOT NULL DEFAULT 'active',
  "access_role" text,
  "last_checked_at" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "security_camera_devices"
    ADD CONSTRAINT security_camera_devices_status_check
    CHECK ("status" IN ('active','offline','maintenance','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "security_camera_devices_villa_idx"
  ON "security_camera_devices" ("villa_id");
CREATE INDEX IF NOT EXISTS "security_camera_devices_project_idx"
  ON "security_camera_devices" ("project_id");
CREATE INDEX IF NOT EXISTS "security_camera_devices_status_idx"
  ON "security_camera_devices" ("status");

-- 8) RLS — internal only on every new table (owners + guests stay out).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'villa_calendar_blocks',
      'villa_readiness_states',
      'booking_stay_events',
      'checkin_checkout_requests',
      'user_responsibility_scopes',
      'security_camera_devices'
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

-- Cameras are SECURITY-sensitive — extra defence in depth: deny non-internal
-- writes at the DB layer too (mutations only via service-role / authenticated
-- internal users via service helpers).
DROP POLICY IF EXISTS internal_write ON "security_camera_devices";
CREATE POLICY internal_write ON "security_camera_devices"
  FOR ALL USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

COMMIT;
