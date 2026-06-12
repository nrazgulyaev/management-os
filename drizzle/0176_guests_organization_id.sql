-- =============================================================================
-- 0176 · TENANCY (guests) — give `guests` a real organization_id so the Guests
--        list can be scoped per tenant directly (replacing the EXISTS-on-
--        bookings interim). `guests` previously had NO org column, so listGuests
--        returned every org's guests (the Guests nav + the booking guest-picker).
--
-- RESOLUTION: a guest's org = the org of their earliest booking
-- (bookings.organization_id is NOT NULL since 0155). Guests with no bookings
-- (rare — manually created, not yet booked) fall back to the single
-- ARCONIQUE_DEFAULT seed org.
--
-- SCOPE: SCHEMA + BACKFILL + INDEX, threaded into the app layer in the same PR
-- (listGuests reads eq(organization_id); createGuestAction + the channel-manager
-- + direct-booking guest writers stamp it). The column lands NULLABLE — mirrors
-- the 0173 owners style. On a provisioned DB the default-org sweep leaves zero
-- NULLs; reads scope by equality so any residual NULL is simply excluded.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE … WHERE organization_id IS NULL
-- + CREATE INDEX IF NOT EXISTS. No NOT NULL. Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

-- 1) Resolve from the guest's earliest booking.
UPDATE guests g
   SET organization_id = b.organization_id
  FROM (
    SELECT DISTINCT ON (guest_id) guest_id, organization_id
      FROM bookings
     WHERE guest_id IS NOT NULL
     ORDER BY guest_id, created_at ASC
  ) b
 WHERE b.guest_id = g.id
   AND g.organization_id IS NULL;

-- 2) Any guest still NULL (no bookings) → the single ARCONIQUE_DEFAULT seed org.
--    Skipped on a bare env lacking it (column simply stays NULL — never fail).
DO $$
DECLARE
  default_org_id uuid;
BEGIN
  SELECT id INTO default_org_id
    FROM organizations
   WHERE organization_code = 'ARCONIQUE_DEFAULT'
   LIMIT 1;
  IF default_org_id IS NOT NULL THEN
    UPDATE guests SET organization_id = default_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS guests_organization_idx ON guests (organization_id);

COMMIT;
