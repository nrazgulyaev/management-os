-- =============================================================================
-- 0187 · ICAL-EXPORT-1 — outbound iCal availability feeds (Wave 1a of the
--        channel-manager plan). One capability-URL token per villa; the public
--        route /api/ical/[token] serves an RFC-5545 calendar of that villa's
--        blocking events (confirmed/in-house bookings + active manual blocks)
--        so OTAs (Airbnb / Booking.com / Vrbo "import calendar") can block
--        availability from us. Before this, the platform could only IMPORT
--        iCal (channel_calendar_feeds) — a booking here never blocked the
--        villa anywhere else.
--
-- Token model mirrors guest_stay_tokens: the RAW token (32 bytes → base64url,
-- 43 chars) is shown ONCE at generate/rotate time and never persisted — only
-- the SHA-256 hex hash + an 8-char display prefix are stored. Rotation
-- deactivates the old row and inserts a fresh one (history preserved for
-- audit); at most ONE ACTIVE token per villa (partial unique index).
--
-- RLS: ENABLE + FORCE + org-membership policy (0111 idiom). The app role is
-- BYPASSRLS so this is defense-in-depth for other roles — added here so the
-- p111 RLS-coverage ratchet doesn't grow (new tables must ship WITH RLS).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + guarded indexes + DROP POLICY IF
-- EXISTS. Safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS villa_ical_export_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,
  villa_id uuid NOT NULL
    REFERENCES villas(id) ON DELETE CASCADE,
  -- SHA-256 hex of the raw token (64 chars). The raw token never persists.
  token_hash text NOT NULL UNIQUE,
  -- First 8 base64url chars — ops display without leaking the secret.
  token_prefix text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Stamped on the OLD row when a rotation deactivates it.
  rotated_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer NOT NULL DEFAULT 0
);

-- At most one ACTIVE feed token per villa (rotation deactivates first).
CREATE UNIQUE INDEX IF NOT EXISTS villa_ical_export_tokens_active_villa_uniq
  ON villa_ical_export_tokens(villa_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS villa_ical_export_tokens_org_idx
  ON villa_ical_export_tokens(organization_id);

-- Defense-in-depth RLS (app role is BYPASSRLS; see header).
ALTER TABLE villa_ical_export_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE villa_ical_export_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS villa_ical_export_tokens_org_members ON villa_ical_export_tokens;
CREATE POLICY villa_ical_export_tokens_org_members
  ON villa_ical_export_tokens
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM app_users WHERE auth_user_id = auth.uid()
    )
  );

COMMIT;
