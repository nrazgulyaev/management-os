-- 0124 — Housekeeping turnovers (W4 mgmt-04).
-- One row per villa per day that needs a turnover. Drives the
-- /dashboard/operations/turnovers kanban + the turnover-allocator agent.
-- Single-tenant (mirrors villas/bookings — no organization_id). Idempotent.

CREATE TABLE IF NOT EXISTS "turnovers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE cascade,
  "turnover_date" date NOT NULL,
  -- status: todo | in-progress | inspection | done
  "status" text NOT NULL DEFAULT 'todo',
  "assignee_user_id" uuid REFERENCES "app_users"("id") ON DELETE set null,
  -- booking that checks OUT on turnover_date (the clean trigger)
  "source_booking_id" uuid REFERENCES "bookings"("id") ON DELETE set null,
  -- booking that checks IN on turnover_date (the deadline), if any
  "next_booking_id" uuid REFERENCES "bookings"("id") ON DELETE set null,
  "badge" text,
  -- one-line rationale written by the turnover-allocator agent
  "assignment_rationale" text,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- One turnover row per villa per day — lets the read-side derive missing
-- rows idempotently via ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS "turnovers_villa_date_uniq"
  ON "turnovers" ("villa_id", "turnover_date");
CREATE INDEX IF NOT EXISTS "turnovers_date_idx" ON "turnovers" ("turnover_date");
CREATE INDEX IF NOT EXISTS "turnovers_status_idx" ON "turnovers" ("status");
CREATE INDEX IF NOT EXISTS "turnovers_assignee_idx" ON "turnovers" ("assignee_user_id");
CREATE INDEX IF NOT EXISTS "turnovers_villa_idx" ON "turnovers" ("villa_id");
