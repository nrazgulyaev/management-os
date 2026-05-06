-- =============================================================================
-- Prompt 109 — Guest Booking Notifications + Guest Status Center Polish.
--
-- Four new tables that back the guest-facing direct-booking status center:
--   direct_booking_guest_notifications        — append-only public-safe log
--   direct_booking_guest_status_snapshots     — denormalised public stage view
--   direct_booking_guest_message_threads      — concierge ↔ guest threads
--   direct_booking_guest_messages             — append-only thread messages
--
-- All four are RLS-forced internal-only; guests reach them via
-- token-bound server routes (never via Postgres RLS).  The redaction
-- contract is the single seam — every "publicTitle" / "publicBody" /
-- "bodyRedacted" / "headline" / "body" column is the only thing the
-- guest ever sees.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) direct_booking_guest_notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "direct_booking_guest_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hold_id" uuid REFERENCES "direct_booking_holds"("id") ON DELETE SET NULL,
  "request_id" uuid REFERENCES "direct_booking_requests"("id")
    ON DELETE SET NULL,
  "deposit_id" uuid REFERENCES "direct_booking_deposits"("id")
    ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "notification_key" text NOT NULL,
  "public_title" text NOT NULL,
  "public_body" text NOT NULL,
  "public_action_label" text,
  "public_action_href" text,
  "severity" text NOT NULL DEFAULT 'info',
  "status" text NOT NULL DEFAULT 'unread',
  "dedupe_key" text NOT NULL,
  "visible_from" timestamptz NOT NULL DEFAULT now(),
  "read_at" timestamptz,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_guest_notifications"
    ADD CONSTRAINT direct_booking_guest_notifications_severity_check
    CHECK ("severity" IN ('info', 'success', 'warning', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_guest_notifications"
    ADD CONSTRAINT direct_booking_guest_notifications_status_check
    CHECK ("status" IN ('unread', 'read', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "direct_booking_guest_notifications_hold_idx"
  ON "direct_booking_guest_notifications" ("hold_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "direct_booking_guest_notifications_request_idx"
  ON "direct_booking_guest_notifications" ("request_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "direct_booking_guest_notifications_deposit_idx"
  ON "direct_booking_guest_notifications" ("deposit_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "direct_booking_guest_notifications_booking_idx"
  ON "direct_booking_guest_notifications" ("booking_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "direct_booking_guest_notifications_status_idx"
  ON "direct_booking_guest_notifications" ("status");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_notifications_key_idx"
  ON "direct_booking_guest_notifications" ("notification_key");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_notifications_severity_idx"
  ON "direct_booking_guest_notifications" ("severity");

CREATE UNIQUE INDEX IF NOT EXISTS
  "direct_booking_guest_notifications_dedupe_unique"
  ON "direct_booking_guest_notifications" ("dedupe_key");

-- -----------------------------------------------------------------------------
-- 2) direct_booking_guest_status_snapshots
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "direct_booking_guest_status_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hold_id" uuid NOT NULL REFERENCES "direct_booking_holds"("id")
    ON DELETE CASCADE,
  "request_id" uuid REFERENCES "direct_booking_requests"("id")
    ON DELETE SET NULL,
  "deposit_id" uuid REFERENCES "direct_booking_deposits"("id")
    ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "public_stage" text NOT NULL,
  "headline" text NOT NULL,
  "body" text NOT NULL,
  "next_action_label" text,
  "next_action_href" text,
  "guest_can_act" boolean NOT NULL DEFAULT false,
  "hold_expires_at" timestamptz,
  "deposit_expires_at" timestamptz,
  "total_amount_minor" bigint,
  "deposit_amount_minor" bigint,
  "balance_due_minor" bigint,
  "currency" text,
  "villa_label" text,
  "check_in" date,
  "check_out" date,
  "nights" integer,
  "guest_count" integer,
  "source_updated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_guest_status_snapshots"
    ADD CONSTRAINT direct_booking_guest_status_snapshots_stage_check
    CHECK ("public_stage" IN (
      'quote_held', 'request_submitted', 'under_review',
      'deposit_required', 'deposit_pending_confirmation',
      'deposit_confirmed', 'approved', 'confirmed', 'in_house',
      'completed', 'expired', 'cancelled', 'rejected', 'failed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS
  "direct_booking_guest_status_snapshots_hold_unique"
  ON "direct_booking_guest_status_snapshots" ("hold_id");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_status_snapshots_request_idx"
  ON "direct_booking_guest_status_snapshots" ("request_id");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_status_snapshots_deposit_idx"
  ON "direct_booking_guest_status_snapshots" ("deposit_id");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_status_snapshots_booking_idx"
  ON "direct_booking_guest_status_snapshots" ("booking_id");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_status_snapshots_stage_idx"
  ON "direct_booking_guest_status_snapshots" ("public_stage");

-- -----------------------------------------------------------------------------
-- 3) direct_booking_guest_message_threads
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "direct_booking_guest_message_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hold_id" uuid REFERENCES "direct_booking_holds"("id") ON DELETE SET NULL,
  "request_id" uuid REFERENCES "direct_booking_requests"("id")
    ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'open',
  "guest_unread_count" integer NOT NULL DEFAULT 0,
  "staff_unread_count" integer NOT NULL DEFAULT 0,
  "last_guest_message_at" timestamptz,
  "last_staff_message_at" timestamptz,
  "last_message_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_guest_message_threads"
    ADD CONSTRAINT direct_booking_guest_message_threads_status_check
    CHECK ("status" IN ('open', 'closed', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "direct_booking_guest_message_threads_hold_idx"
  ON "direct_booking_guest_message_threads" ("hold_id");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_message_threads_request_idx"
  ON "direct_booking_guest_message_threads" ("request_id");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_message_threads_booking_idx"
  ON "direct_booking_guest_message_threads" ("booking_id");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_message_threads_status_idx"
  ON "direct_booking_guest_message_threads" ("status");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_message_threads_last_msg_idx"
  ON "direct_booking_guest_message_threads" ("last_message_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS
  "direct_booking_guest_message_threads_request_unique"
  ON "direct_booking_guest_message_threads" ("request_id")
  WHERE "request_id" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4) direct_booking_guest_messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "direct_booking_guest_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "thread_id" uuid NOT NULL
    REFERENCES "direct_booking_guest_message_threads"("id") ON DELETE CASCADE,
  "author_type" text NOT NULL,
  "body" text NOT NULL,
  "body_redacted" text NOT NULL,
  "visibility" text NOT NULL DEFAULT 'guest_visible',
  "status_snapshot" text,
  "read_by_guest_at" timestamptz,
  "read_by_staff_at" timestamptz,
  "created_by_app_user_id" uuid REFERENCES "app_users"("id")
    ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "direct_booking_guest_messages"
    ADD CONSTRAINT direct_booking_guest_messages_author_check
    CHECK ("author_type" IN ('guest', 'staff', 'system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "direct_booking_guest_messages"
    ADD CONSTRAINT direct_booking_guest_messages_visibility_check
    CHECK ("visibility" IN ('guest_visible', 'internal_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "direct_booking_guest_messages_thread_idx"
  ON "direct_booking_guest_messages" ("thread_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "direct_booking_guest_messages_author_idx"
  ON "direct_booking_guest_messages" ("author_type");
CREATE INDEX IF NOT EXISTS "direct_booking_guest_messages_visibility_idx"
  ON "direct_booking_guest_messages" ("visibility");

-- =============================================================================
-- RLS — internal-only.  Guests reach these tables only through token-bound
-- server routes / actions; there is intentionally no public RLS policy.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'direct_booking_guest_notifications',
      'direct_booking_guest_status_snapshots',
      'direct_booking_guest_message_threads',
      'direct_booking_guest_messages'
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
