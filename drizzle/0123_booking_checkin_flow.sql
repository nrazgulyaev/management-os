-- 0123 — Front-office check-in flow persistence + issued door code.
--
-- Backs the 4-step counter check-in wizard (identity → stay → sign →
-- handover). One row per booking holds the step state + the door code
-- issued at handover, so a completed check-in (and its code) survives and
-- the arrivals board can show "checked in · code issued".
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "booking_checkin_flow" (
  "booking_id" uuid PRIMARY KEY REFERENCES "bookings"("id") ON DELETE cascade,
  "current_step" text NOT NULL DEFAULT 'identity',
  "steps_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "door_code" text,
  "completed_at" timestamptz,
  "completed_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
