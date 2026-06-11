-- =============================================================================
-- 0167 · BOOKING PAYMENT RECORD (cash) — make booking_payments writable
--
-- WHY: booking_payments (0120) was seed-only. The booking detail page READS it
-- (booking-detail-queries.ts getBookingPayment) but nothing ever WROTE a row,
-- so an operator could not record the founder's three cash cases — guest pays
--   1. before check-in,
--   2. on arrival,
--   3. on check-out.
-- All three are the SAME act: log a received payment against the booking and
-- show what is still outstanding vs the booking gross.
--
-- WHAT (additive, non-destructive — mirrors src/lib/db/schema/booking-detail.ts):
--   * received_at  timestamptz NULL  — when the operator actually received the
--                  money (cash on arrival, a bank transfer's value date, a
--                  manual card capture). Distinct from captured_at (which the
--                  seed/PSP path used). Backfilled from captured_at for the
--                  existing seeded rows so the detail page keeps a date.
--
-- DERIVED STATUS (no denormalized column — kept honest in the query layer):
--   paid / partially_paid / unpaid is computed at read time from
--   SUM(amount) over non-refunded/non-failed booking_payments vs the booking
--   gross. Nothing to migrate; documented here so the intent is on record.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + a guarded backfill. Safe to re-run
-- under `migrate.ts --force`.
-- =============================================================================

BEGIN;

ALTER TABLE "booking_payments"
  ADD COLUMN IF NOT EXISTS "received_at" timestamptz;

-- Backfill: existing seeded rows used captured_at as the money-in moment.
UPDATE "booking_payments"
  SET "received_at" = "captured_at"
  WHERE "received_at" IS NULL AND "captured_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "booking_payments_received_idx"
  ON "booking_payments" ("received_at");

COMMIT;
