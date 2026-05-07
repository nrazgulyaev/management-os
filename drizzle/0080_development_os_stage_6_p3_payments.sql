-- =============================================================================
-- 0080 — Development OS · Stage 6.P3.A — Payment Processors Foundation
--
-- 3 new tables — payment-processor core for Stage 6.P3:
--   - payment_processor_connections   per-processor configuration. One row
--                                     per processor account (Stripe, Wise
--                                     Payments, PayPal, manual). Encrypted
--                                     credentials, capability flags.
--   - payment_intents                 every payment we initiate (deposits,
--                                     vendor payouts, refunds, etc.).
--                                     Linked to internal records
--                                     (reservation / invoice / investor /
--                                     buyer / vendor) for traceability.
--   - payment_attempts                individual attempts within an intent —
--                                     a failed-and-retried card payment
--                                     becomes 2 rows under one intent.
--
-- Reuses the `banking_set_updated_at()` trigger function from 0079 — both
-- migrations ship together as P3.A.
--
-- RLS: per-org isolation via is_in_user_organization(). Uses FOREACH IN
-- ARRAY (per the migration 0075 lesson). Idempotent.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) payment_processor_connections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "payment_processor_connections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  "provider" TEXT NOT NULL CHECK ("provider" IN (
    'stripe', 'wise_payments', 'paypal', 'manual'
  )),

  "external_account_id" TEXT NOT NULL,
  "account_name" TEXT,

  -- Test vs live keys. Operators can run a connection in 'test' for
  -- staging and flip to 'live' once confident.
  "mode" TEXT NOT NULL CHECK ("mode" IN ('test', 'live')),

  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN (
    'pending', 'connecting', 'active', 'paused', 'error', 'archived'
  )),

  -- Credentials encrypted via STAY_LINK_KMS_SECRET (P1.B helper).
  "credentials" JSONB,

  -- What this connection can do. Examples: ['card_payments',
  -- 'bank_transfers', 'recurring', 'refunds', 'payouts'].
  "capabilities" TEXT[] NOT NULL DEFAULT '{}',

  -- ISO-4217 currency codes the processor will accept.
  "supported_currencies" TEXT[] NOT NULL DEFAULT '{}',

  -- Fee structure. Per-currency / per-method overrides land here as
  -- JSON so the operator UI doesn't need a fees table just yet.
  "fee_structure" JSONB,

  -- Lightweight stats for the operator dashboard. Recomputed by cron.
  "last_event_at" TIMESTAMPTZ,
  "total_payments_processed" INTEGER NOT NULL DEFAULT 0,
  "total_volume_minor" BIGINT NOT NULL DEFAULT 0,

  -- Audit.
  "connected_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "connected_at" TIMESTAMPTZ,
  "archived_at" TIMESTAMPTZ,
  "archive_reason" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("organization_id", "provider", "external_account_id")
);

CREATE INDEX IF NOT EXISTS "payment_processor_org_idx"
  ON "payment_processor_connections"("organization_id");
CREATE INDEX IF NOT EXISTS "payment_processor_status_idx"
  ON "payment_processor_connections"("status") WHERE "status" = 'active';

-- -----------------------------------------------------------------------------
-- 2) payment_intents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "processor_connection_id" UUID NOT NULL REFERENCES "payment_processor_connections"("id") ON DELETE CASCADE,

  -- External (e.g. Stripe pi_... / Wise transfer ID). Idempotency key.
  "external_intent_id" TEXT NOT NULL,
  "external_status" TEXT,

  -- Amount in minor units of `currency`. Always positive — direction is
  -- captured by `purpose` (refund/payout vs deposit/balance).
  "amount_minor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,

  "fees_minor" BIGINT,
  "net_amount_minor" BIGINT,

  -- What this payment is for. Drives downstream linkage + the
  -- bookkeeper UI's "Payments by purpose" view.
  "purpose" TEXT NOT NULL CHECK ("purpose" IN (
    'reservation_deposit', 'reservation_balance', 'investor_capital_call',
    'vendor_payment', 'tax_payment', 'commission_payment', 'refund', 'other'
  )),

  -- Linked records. References are intentionally untyped (no FK) for
  -- some of these because the linked tables live in different schema
  -- modules and the linkage is informational, not load-bearing.
  -- The hard FKs are kept for invoices + vendors — both have stable
  -- platform identities.
  "linked_reservation_id" UUID,
  "linked_invoice_id" UUID REFERENCES "invoices"("id") ON DELETE SET NULL,
  "linked_investor_id" UUID,
  "linked_buyer_id" UUID,
  "linked_vendor_id" UUID REFERENCES "vendors"("id") ON DELETE SET NULL,

  -- Customer (for incoming payments).
  "customer_email" TEXT,
  "customer_name" TEXT,
  "customer_country" TEXT,

  -- Lifecycle FSM.
  "lifecycle_state" TEXT NOT NULL DEFAULT 'created' CHECK ("lifecycle_state" IN (
    'created', 'processing', 'requires_action',
    'succeeded', 'cancelled', 'failed', 'refunded'
  )),

  "completed_at" TIMESTAMPTZ,
  "cancelled_at" TIMESTAMPTZ,
  "refunded_at" TIMESTAMPTZ,

  -- Refund tracking. `refund_amount_minor` is the cumulative refunded
  -- amount; partial refunds bump it incrementally.
  "refund_amount_minor" BIGINT,
  "refund_reason" TEXT,

  "raw_payload" JSONB,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("processor_connection_id", "external_intent_id")
);

CREATE INDEX IF NOT EXISTS "payment_intents_org_idx"
  ON "payment_intents"("organization_id");
CREATE INDEX IF NOT EXISTS "payment_intents_state_idx"
  ON "payment_intents"("lifecycle_state");
CREATE INDEX IF NOT EXISTS "payment_intents_purpose_idx"
  ON "payment_intents"("purpose");
CREATE INDEX IF NOT EXISTS "payment_intents_invoice_idx"
  ON "payment_intents"("linked_invoice_id")
  WHERE "linked_invoice_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "payment_intents_vendor_idx"
  ON "payment_intents"("linked_vendor_id")
  WHERE "linked_vendor_id" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3) payment_attempts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "payment_attempts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "payment_intent_id" UUID NOT NULL REFERENCES "payment_intents"("id") ON DELETE CASCADE,

  "external_attempt_id" TEXT NOT NULL,
  "method_type" TEXT,
  "method_details" JSONB,

  "status" TEXT NOT NULL,
  "error_code" TEXT,
  "error_message" TEXT,

  "amount_minor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "fee_minor" BIGINT,

  "raw_payload" JSONB,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "payment_attempts_intent_idx"
  ON "payment_attempts"("payment_intent_id");
CREATE INDEX IF NOT EXISTS "payment_attempts_org_idx"
  ON "payment_attempts"("organization_id");

-- -----------------------------------------------------------------------------
-- 4) updated_at triggers — reuse banking_set_updated_at() from 0079
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "trg_payment_processors_updated_at"
  ON "payment_processor_connections";
CREATE TRIGGER "trg_payment_processors_updated_at"
  BEFORE UPDATE ON "payment_processor_connections"
  FOR EACH ROW EXECUTE FUNCTION "banking_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_payment_intents_updated_at"
  ON "payment_intents";
CREATE TRIGGER "trg_payment_intents_updated_at"
  BEFORE UPDATE ON "payment_intents"
  FOR EACH ROW EXECUTE FUNCTION "banking_set_updated_at"();

-- payment_attempts is append-only — no updated_at column / trigger.

-- -----------------------------------------------------------------------------
-- 5) RLS — per-org isolation via is_in_user_organization() (Stage 5.J helper).
--
-- Uses FOREACH t IN ARRAY ARRAY[...] per the migration 0075 lesson.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payment_processor_connections',
    'payment_intents',
    'payment_attempts'
  ]
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
