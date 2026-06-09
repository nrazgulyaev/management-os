-- Migration 0143 — owner_guest_preapprovals
--
-- OWNER-ENGAGEMENT (#168 follow-up). The owner home "Pre-approve a guest"
-- quick-action used to deep-link to the generic inbox. This table makes it a
-- REAL structured record: an owner pre-authorises friends/family to be hosted
-- at one of their villas during a window, WITHOUT a paid booking. Mgmt acts on
-- the record (review → approve / decline) and the owner sees the status.
--
-- This is deliberately NOT a `bookings` row: a pre-approval has no rate, no
-- charge, and no settlement — it is a courtesy authorisation that mgmt
-- converts into an operational hold when the guest actually books dates. The
-- adjacent "Schedule a Q-review call" action does NOT need a table — it opens
-- an owner_threads conversation (kind='tax_question' → UI q_review) seeded
-- with structured scheduling chips, so it is derived from existing tables.
--
-- Owner-scoped (owner_id FK → owners, cascade). No money columns. Idempotent.

CREATE TABLE IF NOT EXISTS owner_guest_preapprovals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  -- The villa the guest is pre-approved for (one of the owner's villas).
  -- Plain uuid (no FK) to avoid an import cycle with the villas module;
  -- ownership is enforced in the action against ownership_shares.
  villa_id uuid NOT NULL,
  -- Who is being hosted (free-text — these are the owner's friends/family).
  guest_name text NOT NULL,
  guest_relationship text,
  party_size integer NOT NULL DEFAULT 1,
  -- The authorisation window (date-only, no nightly rate).
  arrive_on date NOT NULL,
  depart_on date NOT NULL,
  notes text,
  -- requested | approved | declined | cancelled | converted
  status text NOT NULL DEFAULT 'requested',
  -- The owner_threads conversation opened for this pre-approval, so mgmt can
  -- discuss it inline. Soft link (no FK) — thread may be archived independently.
  thread_id uuid,
  decided_by_app_user_id uuid,
  decided_at timestamptz,
  decision_note text,
  created_by_app_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_guest_preapprovals_owner_created_idx
  ON owner_guest_preapprovals (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS owner_guest_preapprovals_owner_status_idx
  ON owner_guest_preapprovals (owner_id, status);

CREATE INDEX IF NOT EXISTS owner_guest_preapprovals_villa_arrive_idx
  ON owner_guest_preapprovals (villa_id, arrive_on);
