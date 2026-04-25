-- Arconique Management OS — Migration 0001 · Admin workflow hardening
-- Apply with: npm run db:migrate -- 0001
-- Or: psql "$DIRECT_URL" -f drizzle/0001_admin_workflow_hardening.sql
-- Idempotent on re-run.

BEGIN;

-- =============================================================================
-- 1) Project status — add lifecycle values: planning, under_construction, active
--    Existing values: development | soft_open | live | archived
--    We migrate development → under_construction, soft_open → active, live → managed (kept).
-- =============================================================================
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_status_check";
UPDATE "projects" SET "status" = 'under_construction' WHERE "status" = 'development';
UPDATE "projects" SET "status" = 'active' WHERE "status" = 'soft_open';
UPDATE "projects" SET "status" = 'managed' WHERE "status" = 'live';
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_status_check"
  CHECK ("status" IN ('planning','under_construction','active','managed','archived'));

ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'active';

-- =============================================================================
-- 2) Villa status — add 'archived'. Keep all operational statuses (the design
--    system + operations board depend on the rich set).
-- =============================================================================
ALTER TABLE "villas" DROP CONSTRAINT IF EXISTS "villas_status_check";
ALTER TABLE "villas"
  ADD CONSTRAINT "villas_status_check"
  CHECK ("status" IN (
    'available','occupied','checkout_pending','cleaning','inspection',
    'ready','maintenance_blocked','owner_stay','out_of_service','archived'
  ));

-- =============================================================================
-- 3) Owners — add 'inactive'.
-- =============================================================================
ALTER TABLE "owners" DROP CONSTRAINT IF EXISTS "owners_status_check";
ALTER TABLE "owners"
  ADD CONSTRAINT "owners_status_check"
  CHECK ("status" IN ('active','inactive','onboarding','archived'));

-- =============================================================================
-- 4) Booking channels — add 'inactive' (paused stays as a synonym).
-- =============================================================================
ALTER TABLE "booking_channels" DROP CONSTRAINT IF EXISTS "booking_channels_status_check";
ALTER TABLE "booking_channels"
  ADD CONSTRAINT "booking_channels_status_check"
  CHECK ("status" IN ('active','paused','inactive','archived'));

-- =============================================================================
-- 5) Guests — introduce status column (default active).
-- =============================================================================
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';
ALTER TABLE "guests" DROP CONSTRAINT IF EXISTS "guests_status_check";
ALTER TABLE "guests"
  ADD CONSTRAINT "guests_status_check"
  CHECK ("status" IN ('active','archived'));

-- =============================================================================
-- 6) Documents — introduce status column.
-- =============================================================================
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_status_check";
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_status_check"
  CHECK ("status" IN ('active','archived'));

-- =============================================================================
-- 7) Helpful indexes for admin filters.
-- =============================================================================
CREATE INDEX IF NOT EXISTS "ownership_shares_status_idx" ON "ownership_shares" ("status");
CREATE INDEX IF NOT EXISTS "bookings_check_in_idx" ON "bookings" ("check_in");
CREATE INDEX IF NOT EXISTS "guests_status_idx" ON "guests" ("status");
CREATE INDEX IF NOT EXISTS "documents_status_idx" ON "documents" ("status");

-- =============================================================================
-- 8) Audit retention helper view (read-only convenience).
-- =============================================================================
CREATE OR REPLACE VIEW "v_recent_audit_events" AS
  SELECT id, action, entity_type, entity_id, actor_user_id, created_at
    FROM audit_events
   ORDER BY created_at DESC
   LIMIT 200;

COMMIT;
