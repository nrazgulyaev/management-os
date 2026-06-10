-- 0166 · XENDIT PSP RAILS — schema room for the first real Indonesia-local
-- payment provider (Xendit: QRIS / e-wallets / Virtual Accounts via the
-- Invoice API).
--
-- Three small, guarded changes — everything else reuses the existing
-- Stage 6.P3 payment tables (migration 0080):
--
--   1. payment_processor_connections.provider CHECK gains 'xendit'.
--      The original constraint only allowed stripe/wise_payments/paypal/
--      manual, so a Xendit connection row could not be inserted at all.
--
--   2. payment_intents.purpose CHECK gains 'buyer_installment'.
--      The first end-to-end Xendit consumer is the buyer contract-
--      installment ladder; none of the existing purposes describes it
--      honestly ('other' would hide the linkage from the bookkeeper UI).
--
--   3. payment_intents.linked_contract_milestone_id — soft link (no FK,
--      consistent with linked_reservation_id / linked_buyer_id) from a
--      PSP payment intent to the contract milestone it settles, plus an
--      index so the buyer portal can find pending online payments per
--      milestone. Without this column there is no queryable place to
--      hold the provider↔installment reference (rawPayload JSON is not
--      a join surface).
--
-- IDEMPOTENT: constraint swaps drop-if-exists then re-add; column +
-- index use IF NOT EXISTS, so `migrate.ts --force` stays safe to re-run.

BEGIN;

-- 1) Allow 'xendit' as a payment processor provider.
ALTER TABLE "payment_processor_connections"
  DROP CONSTRAINT IF EXISTS "payment_processor_connections_provider_check";
ALTER TABLE "payment_processor_connections"
  ADD CONSTRAINT "payment_processor_connections_provider_check"
  CHECK ("provider" IN ('stripe', 'wise_payments', 'paypal', 'manual', 'xendit'));

-- 2) Allow 'buyer_installment' as a payment purpose.
ALTER TABLE "payment_intents"
  DROP CONSTRAINT IF EXISTS "payment_intents_purpose_check";
ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_purpose_check"
  CHECK ("purpose" IN (
    'reservation_deposit', 'reservation_balance', 'investor_capital_call',
    'vendor_payment', 'tax_payment', 'commission_payment', 'refund',
    'buyer_installment', 'other'
  ));

-- 3) Soft link from a payment intent to the contract milestone it pays.
ALTER TABLE "payment_intents"
  ADD COLUMN IF NOT EXISTS "linked_contract_milestone_id" UUID;

CREATE INDEX IF NOT EXISTS "payment_intents_milestone_idx"
  ON "payment_intents"("linked_contract_milestone_id")
  WHERE "linked_contract_milestone_id" IS NOT NULL;

COMMIT;
