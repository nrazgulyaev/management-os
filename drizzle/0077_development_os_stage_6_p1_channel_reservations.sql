-- =============================================================================
-- 0077 — Development OS · Stage 6.P1.A — Channel Reservations + Commissions
--
-- 2 new tables:
--   - channel_reservations         every reservation pulled from a channel
--                                  (or pushed via webhook). Holds the raw
--                                  payload + projected fields + lifecycle
--                                  state. Linked to internal `bookings` via
--                                  `internal_booking_id` once the workflow
--                                  has projected it into the platform's
--                                  domain-model booking record.
--   - channel_commission_records   per-reservation commission liability
--                                  tracking: expected amount, channel
--                                  invoice received y/n, payment made y/n,
--                                  reconciled flag. Bookkeeper uses this
--                                  to match against monthly commission
--                                  invoices from each channel.
--
-- RLS: per-org isolation via is_in_user_organization(). Idempotent.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) channel_reservations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "channel_reservations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "channel_connection_id" UUID NOT NULL REFERENCES "channel_connections"("id") ON DELETE CASCADE,

  -- External identifiers + raw payload. `raw_payload` is the source of
  -- truth for replay/debugging — projected fields below may drift from
  -- channel changes, but raw_payload is always whatever the channel sent.
  "external_reservation_id" TEXT NOT NULL,
  "external_status" TEXT,
  "raw_payload" JSONB NOT NULL,

  -- Internal mapping. `internal_booking_id` is set when the workflow
  -- projects this channel reservation into the platform's domain
  -- `bookings` table. NULL while the row is still in `received` state
  -- and the workflow hasn't run yet (or failed and is awaiting retry).
  "internal_booking_id" UUID REFERENCES "bookings"("id") ON DELETE SET NULL,
  "internal_guest_contact_id" UUID REFERENCES "contacts"("id") ON DELETE SET NULL,

  -- Projected guest details (denormalised from raw_payload for query
  -- ergonomics — the unified inbox needs to filter/search by these
  -- without parsing JSONB every query).
  "guest_first_name" TEXT,
  "guest_last_name" TEXT,
  "guest_email" TEXT,
  "guest_phone" TEXT,
  "guest_country" TEXT,

  "check_in" DATE NOT NULL,
  "check_out" DATE NOT NULL,
  "num_adults" INTEGER,
  "num_children" INTEGER,
  "num_infants" INTEGER,

  -- Pricing (in minor units, channel currency). `channel_commission_minor`
  -- is the channel's stated commission on this reservation; the
  -- channel_commission_records row is the bookkeeping projection of
  -- this number for reconciliation.
  "total_amount_minor" BIGINT,
  "currency" TEXT NOT NULL,
  "channel_commission_minor" BIGINT,
  "taxes_minor" BIGINT,
  "service_fees_minor" BIGINT,

  "payment_status" TEXT,
  "payment_collected_by" TEXT CHECK (
    "payment_collected_by" IS NULL OR
    "payment_collected_by" IN ('channel', 'hotel', 'mixed')
  ),

  -- Lifecycle. `received` = ingested into channel_reservations but the
  -- internal booking projection hasn't run yet. `confirmed` = booking
  -- record exists, all-systems-go. `modified`, `cancelled`, `no_show`,
  -- `completed` are downstream states.
  "reservation_state" TEXT NOT NULL DEFAULT 'received' CHECK ("reservation_state" IN (
    'received', 'confirmed', 'modified', 'cancelled', 'no_show', 'completed'
  )),

  -- Conflict-detection flag. Set by the conflict-detection cron (P1.G)
  -- when this reservation overlaps an already-confirmed booking on the
  -- same villa. Operator must resolve manually before downstream guest
  -- journey workflows fire.
  "conflict_pending" BOOLEAN NOT NULL DEFAULT false,
  "conflict_with_reservation_id" UUID REFERENCES "channel_reservations"("id") ON DELETE SET NULL,

  "cancellation_date" TIMESTAMPTZ,
  "cancellation_reason" TEXT,

  "special_requests" TEXT,
  "internal_notes" TEXT,

  -- Distinct timestamps:
  --   reservation_created_at — when the guest booked on the channel
  --   received_at            — when our backend ingested it
  --   last_modified_at       — last time the channel sent an update
  "reservation_created_at" TIMESTAMPTZ NOT NULL,
  "received_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_modified_at" TIMESTAMPTZ,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency: if the same reservation arrives via webhook + polling,
  -- the unique constraint blocks the duplicate insert. Updates use the
  -- existing row.
  CONSTRAINT "channel_reservations_connection_external_unique"
    UNIQUE ("channel_connection_id", "external_reservation_id")
);

CREATE INDEX IF NOT EXISTS "channel_reservations_org_idx"
  ON "channel_reservations"("organization_id");
CREATE INDEX IF NOT EXISTS "channel_reservations_dates_idx"
  ON "channel_reservations"("check_in", "check_out");
CREATE INDEX IF NOT EXISTS "channel_reservations_state_idx"
  ON "channel_reservations"("reservation_state");
CREATE INDEX IF NOT EXISTS "channel_reservations_internal_booking_idx"
  ON "channel_reservations"("internal_booking_id")
  WHERE "internal_booking_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "channel_reservations_received_idx"
  ON "channel_reservations"("received_at" DESC);
-- Partial index for the operator's "needs review" inbox.
CREATE INDEX IF NOT EXISTS "channel_reservations_conflict_idx"
  ON "channel_reservations"("conflict_pending")
  WHERE "conflict_pending" = TRUE;

CREATE OR REPLACE FUNCTION "channel_reservations_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_channel_reservations_updated_at" ON "channel_reservations";
CREATE TRIGGER "trg_channel_reservations_updated_at"
  BEFORE UPDATE ON "channel_reservations"
  FOR EACH ROW EXECUTE FUNCTION "channel_reservations_set_updated_at"();

-- -----------------------------------------------------------------------------
-- 2) channel_commission_records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "channel_commission_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "channel_reservation_id" UUID NOT NULL REFERENCES "channel_reservations"("id") ON DELETE CASCADE,

  -- Expected commission as computed at reservation receipt. Locked at
  -- this point so that subsequent rate changes on the channel don't
  -- silently shift the bookkeeper's reconciliation target.
  "commission_amount_minor" BIGINT NOT NULL,
  "commission_currency" TEXT NOT NULL,

  -- Reconciliation lifecycle: bookkeeper marks each step as it happens.
  -- `invoice_received` = channel sent us a commission invoice for this
  -- reservation (typically aggregated monthly). `payment_made` = we paid
  -- the invoice. `reconciled` = bookkeeper confirmed everything matches.
  "invoice_received" BOOLEAN NOT NULL DEFAULT false,
  "invoice_received_at" TIMESTAMPTZ,
  "invoice_amount_minor" BIGINT,
  "invoice_reference" TEXT,

  "payment_made" BOOLEAN NOT NULL DEFAULT false,
  "payment_made_at" TIMESTAMPTZ,

  "reconciled" BOOLEAN NOT NULL DEFAULT false,
  "reconciled_at" TIMESTAMPTZ,

  "notes" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One commission record per reservation. Re-runs of the projection
  -- workflow update the existing row rather than inserting duplicates.
  CONSTRAINT "channel_commission_records_reservation_unique"
    UNIQUE ("channel_reservation_id")
);

CREATE INDEX IF NOT EXISTS "channel_commission_records_org_idx"
  ON "channel_commission_records"("organization_id");
-- Partial index for the bookkeeper's "outstanding commission" view.
CREATE INDEX IF NOT EXISTS "channel_commission_records_unreconciled_idx"
  ON "channel_commission_records"("organization_id")
  WHERE "reconciled" = FALSE;

CREATE OR REPLACE FUNCTION "channel_commission_records_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_channel_commission_records_updated_at" ON "channel_commission_records";
CREATE TRIGGER "trg_channel_commission_records_updated_at"
  BEFORE UPDATE ON "channel_commission_records"
  FOR EACH ROW EXECUTE FUNCTION "channel_commission_records_set_updated_at"();

-- -----------------------------------------------------------------------------
-- 3) RLS — per-org isolation via is_in_user_organization()
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['channel_reservations', 'channel_commission_records'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS org_isolation ON %I; '
      'CREATE POLICY org_isolation ON %I FOR ALL '
      'USING (public.is_in_user_organization(organization_id)) '
      'WITH CHECK (public.is_in_user_organization(organization_id));',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
