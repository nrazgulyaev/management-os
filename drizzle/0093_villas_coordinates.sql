-- Stage 11.B.1 — Villa geo coordinates for field PWA GeoCheckIn
-- ============================================================================
--
-- Adds an optional `coordinates jsonb` column to the villas table.
-- Stage 10.D's <GeoCheckIn> primitive accepts an `anchor: {lat, lng}`
-- and renders a "you're at this villa" affordance for field-staff
-- starting a task. Without per-villa coordinates the primitive can't
-- be wired against real villas.
--
-- Shape:
--   { "lat": number, "lng": number, "accuracy_m"?: number, "source"?: string }
--
-- JSONB (not two numeric columns) lets us carry future extras (the
-- geocode source + the original capture accuracy + a postal address
-- snapshot) without another migration. Single per-row read; no need
-- to index for current usage (lookup is always by villa_id, not by
-- distance / bbox query).
--
-- Default NULL: existing villas don't get auto-coordinates. Operators
-- populate them via a new villa-edit flow (Stage 11.B.2 carry-over)
-- or via a one-shot CSV import. Until coordinates exist for a villa,
-- <GeoCheckIn> renders a graceful "Geo check-in not configured for
-- this villa" hint.
--
-- Rollback:
--   ALTER TABLE villas DROP COLUMN coordinates;

ALTER TABLE villas
  ADD COLUMN coordinates jsonb;

COMMENT ON COLUMN villas.coordinates IS
  'Optional villa geo anchor. Shape: {"lat": number, "lng": number, "accuracy_m"?: number, "source"?: string}. Stage 11.B.1.';
