-- =============================================================================
-- 0175 · VIP SIGNAL ON GUESTS + BOOKINGS (front-office vip-prep monitor)
--
-- WHY: the Watch panel's vip-prep monitor had no VIP signal to read —
-- guests/bookings carried no is_vip flag. This adds the durable flag so
-- detectVipPrep can flag today's arrivals for VIP guests.
--
-- WHAT (additive, behaviour-preserving):
--   * guests.is_vip   boolean NOT NULL DEFAULT false — the guest is VIP across
--     all stays (primary, durable signal).
--   * bookings.is_vip boolean NULL — per-stay override (tri-state): NULL =
--     inherit the guest flag; true = flag THIS stay even if the guest isn't
--     marked; false = exclude THIS stay even if the guest is a VIP.
--
-- Every existing row gets is_vip=false / NULL, so the monitor simply shows 0
-- until flags are set — no backfill needed.
--
-- Indexes: partial indexes on the few rows the monitor cares about (is_vip
-- true). Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_vip boolean;

CREATE INDEX IF NOT EXISTS guests_is_vip_idx ON guests (is_vip) WHERE is_vip = true;
CREATE INDEX IF NOT EXISTS bookings_is_vip_idx ON bookings (is_vip) WHERE is_vip = true;

COMMIT;
