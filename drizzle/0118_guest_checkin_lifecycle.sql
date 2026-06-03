-- 0118 — Guest check-in lifecycle (FC-GUEST-STAY-PORTAL + FC-MANAGEMENT-FRONT-OFFICE).
--
-- One `checkins` row per booking, tracking the cross-surface check-in flow:
--   not_started → in_progress → submitted → approved → code_issued
--
-- The guest submits (online check-in); the operator approves in Front office;
-- approval issues the door code (smart_lock_access_codes) and flips
-- bookings.status → checked_in. The guest's villa code only reveals once
-- status = 'code_issued'.

CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started',
  guest_count integer,
  eta text,
  passport_uploaded boolean NOT NULL DEFAULT false,
  notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  code_issued_at timestamptz,
  approved_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS checkins_booking_unique ON checkins (booking_id);
CREATE INDEX IF NOT EXISTS checkins_status_idx ON checkins (status);
