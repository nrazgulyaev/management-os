-- Arconique Management OS — Migration 0007
-- · Channel calendar feeds (iCal/ICS) + parsed events + booking conflicts
-- · Booking automation rules + per-booking run log
-- · Material usage → finance bridge link table
-- · task_material_usage gains a finance bridge status column
-- Idempotent on re-run.

BEGIN;

-- =============================================================================
-- 1) channel_calendar_feeds
-- =============================================================================
CREATE TABLE IF NOT EXISTS "channel_calendar_feeds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_channel_id" uuid REFERENCES "booking_channels"("id") ON DELETE SET NULL,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "feed_name" text NOT NULL,
  "feed_url" text NOT NULL,
  "feed_type" text NOT NULL DEFAULT 'ical'
    CHECK ("feed_type" IN ('ical','manual_ics','airbnb_ical','booking_ical','vrbo_ical')),
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','paused','error','archived')),
  "last_synced_at" timestamptz,
  "last_success_at" timestamptz,
  "last_error_at" timestamptz,
  "last_error" text,
  "sync_interval_minutes" integer NOT NULL DEFAULT 180,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ccf_villa_idx"    ON "channel_calendar_feeds" ("villa_id");
CREATE INDEX IF NOT EXISTS "ccf_status_idx"   ON "channel_calendar_feeds" ("status");
CREATE INDEX IF NOT EXISTS "ccf_channel_idx"  ON "channel_calendar_feeds" ("booking_channel_id");
DROP TRIGGER IF EXISTS trg_set_updated_at ON "channel_calendar_feeds";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "channel_calendar_feeds"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2) channel_calendar_events
-- =============================================================================
CREATE TABLE IF NOT EXISTS "channel_calendar_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "feed_id" uuid NOT NULL REFERENCES "channel_calendar_feeds"("id") ON DELETE CASCADE,
  "external_uid" text NOT NULL,
  "external_summary" text,
  "external_description" text,
  "external_location" text,
  "check_in" date NOT NULL,
  "check_out" date NOT NULL,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','cancelled','ignored')),
  "raw_ics" jsonb,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "conflict_status" text NOT NULL DEFAULT 'none'
    CHECK ("conflict_status" IN ('none','duplicate','overlap','blocked_date','unresolved')),
  "conflict_notes" text,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "cce_feed_uid_unique"
  ON "channel_calendar_events" ("feed_id","external_uid");
CREATE INDEX IF NOT EXISTS "cce_feed_idx"    ON "channel_calendar_events" ("feed_id");
CREATE INDEX IF NOT EXISTS "cce_booking_idx" ON "channel_calendar_events" ("booking_id");
CREATE INDEX IF NOT EXISTS "cce_dates_idx"   ON "channel_calendar_events" ("check_in","check_out");
CREATE INDEX IF NOT EXISTS "cce_status_idx"  ON "channel_calendar_events" ("status");
DROP TRIGGER IF EXISTS trg_set_updated_at ON "channel_calendar_events";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "channel_calendar_events"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3) booking_conflicts
-- =============================================================================
CREATE TABLE IF NOT EXISTS "booking_conflicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE CASCADE,
  "calendar_event_id" uuid REFERENCES "channel_calendar_events"("id") ON DELETE CASCADE,
  "conflict_type" text NOT NULL
    CHECK ("conflict_type" IN ('overlap','duplicate','missing_checkout','blocked_date','channel_mismatch')),
  "severity" text NOT NULL DEFAULT 'warning'
    CHECK ("severity" IN ('info','warning','critical')),
  "description" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open'
    CHECK ("status" IN ('open','acknowledged','resolved','ignored')),
  "resolved_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "bc_villa_idx"   ON "booking_conflicts" ("villa_id");
CREATE INDEX IF NOT EXISTS "bc_status_idx"  ON "booking_conflicts" ("status");
CREATE INDEX IF NOT EXISTS "bc_booking_idx" ON "booking_conflicts" ("booking_id");
DROP TRIGGER IF EXISTS trg_set_updated_at ON "booking_conflicts";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "booking_conflicts"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 4) booking_automation_rules
-- =============================================================================
CREATE TABLE IF NOT EXISTS "booking_automation_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "rule_name" text NOT NULL,
  "trigger_event" text NOT NULL
    CHECK ("trigger_event" IN ('booking_created','booking_updated','booking_cancelled','checkout_due','checkin_due')),
  "task_category" text NOT NULL
    CHECK ("task_category" IN ('housekeeping','inspection','maintenance','concierge','guest_request','procurement','admin')),
  "task_type_key" text,
  "checklist_template_key" text,
  "title_template" text NOT NULL,
  "due_offset_minutes" integer NOT NULL DEFAULT 0,
  "assigned_role" text,
  "assigned_to" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "priority" text NOT NULL DEFAULT 'normal'
    CHECK ("priority" IN ('low','normal','high','urgent')),
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','paused','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "bar_status_idx"  ON "booking_automation_rules" ("status");
CREATE INDEX IF NOT EXISTS "bar_trigger_idx" ON "booking_automation_rules" ("trigger_event");
CREATE INDEX IF NOT EXISTS "bar_villa_idx"   ON "booking_automation_rules" ("villa_id");
CREATE INDEX IF NOT EXISTS "bar_project_idx" ON "booking_automation_rules" ("project_id");
DROP TRIGGER IF EXISTS trg_set_updated_at ON "booking_automation_rules";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "booking_automation_rules"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 5) booking_automation_runs
-- =============================================================================
CREATE TABLE IF NOT EXISTS "booking_automation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "rule_id" uuid REFERENCES "booking_automation_rules"("id") ON DELETE SET NULL,
  "task_id" uuid REFERENCES "operation_tasks"("id") ON DELETE SET NULL,
  "run_status" text NOT NULL DEFAULT 'created'
    CHECK ("run_status" IN ('created','skipped','failed')),
  "reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
-- Idempotency: at most one (booking, rule) pair. NULL rule_id means
-- a manual / synthetic run; allow many of those.
CREATE UNIQUE INDEX IF NOT EXISTS "bar_run_unique"
  ON "booking_automation_runs" ("booking_id","rule_id")
  WHERE "rule_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "bar_run_booking_idx" ON "booking_automation_runs" ("booking_id");

-- =============================================================================
-- 6) finance_material_usage_links — bridge from task_material_usage to expense_lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS "finance_material_usage_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_material_usage_id" uuid NOT NULL
    REFERENCES "task_material_usage"("id") ON DELETE CASCADE,
  "inventory_movement_id" uuid REFERENCES "inventory_movements"("id") ON DELETE SET NULL,
  "expense_line_id" uuid REFERENCES "expense_lines"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "owner_chargeable" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'pending'
    CHECK ("status" IN ('pending','created','skipped_locked_period','skipped_not_chargeable','failed','reversed')),
  "reason" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "fmul_usage_unique"
  ON "finance_material_usage_links" ("task_material_usage_id");
CREATE INDEX IF NOT EXISTS "fmul_status_idx"  ON "finance_material_usage_links" ("status");
CREATE INDEX IF NOT EXISTS "fmul_expense_idx" ON "finance_material_usage_links" ("expense_line_id");
DROP TRIGGER IF EXISTS trg_set_updated_at ON "finance_material_usage_links";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "finance_material_usage_links"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 7) task_material_usage — finance bridge status (denormalised pointer)
-- =============================================================================
ALTER TABLE "task_material_usage"
  ADD COLUMN IF NOT EXISTS "owner_chargeable" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "finance_bridge_status" text NOT NULL DEFAULT 'pending'
    CHECK ("finance_bridge_status" IN ('pending','created','skipped_locked_period','skipped_not_chargeable','failed','reversed')),
  ADD COLUMN IF NOT EXISTS "expense_line_id" uuid REFERENCES "expense_lines"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "tmu_bridge_status_idx"
  ON "task_material_usage" ("finance_bridge_status");

-- =============================================================================
-- 8) RLS — internal_read on every new table; mutations via server actions.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'channel_calendar_feeds',
      'channel_calendar_events',
      'booking_conflicts',
      'booking_automation_rules',
      'booking_automation_runs',
      'finance_material_usage_links'
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

-- Feed URLs may contain tokens (Airbnb iCal URLs are unguessable). Owners and
-- guests must never see the raw URL via PostgREST — keep the table internal_only.

COMMIT;
