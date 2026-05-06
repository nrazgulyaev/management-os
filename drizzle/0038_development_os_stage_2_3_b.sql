-- =============================================================================
-- 0038 — Development OS · Stage 2.3.B
--   Schema additions to support distribution UI, finance ledger UI, and the
--   five new cron jobs:
--
--   1. development_project_meta gets is_self_sustaining + last_self_sustaining_check_at
--      so the cron job can detect *transitions* (was-false → now-true) and only
--      fire notification on state change.
--   2. dev_bank_accounts gets last_balance_alert_at so the balance-alert cron
--      respects a 24h cooldown per account.
--   3. dev_notification_rules.trigger_event CHECK constraint is widened to
--      accept the 5 new event types introduced by 2.3.B cron jobs:
--        - drawdown_overdue
--        - bank_balance_below_threshold
--        - project_self_sustaining_reached
--        - project_self_sustaining_lost
--        - bank_balance_discrepancy
--      The old constraint is dropped and re-added with the union of the old +
--      new values. Idempotent — DROP CONSTRAINT IF EXISTS then ADD.
--
-- All changes are idempotent. Wrapped in BEGIN; ... COMMIT;.
-- =============================================================================

BEGIN;

-- 1) Self-sustaining tracking on development_project_meta ----------------------
DO $$ BEGIN
  ALTER TABLE "development_project_meta"
    ADD COLUMN "is_self_sustaining" boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "development_project_meta"
    ADD COLUMN "last_self_sustaining_check_at" timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 2) Bank account balance-alert cooldown --------------------------------------
DO $$ BEGIN
  ALTER TABLE "dev_bank_accounts"
    ADD COLUMN "last_balance_alert_at" timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 3) Widen dev_notification_rules.trigger_event CHECK -------------------------
DO $$ BEGIN
  ALTER TABLE "dev_notification_rules"
    DROP CONSTRAINT IF EXISTS notification_rules_trigger_check;
  ALTER TABLE "dev_notification_rules"
    ADD CONSTRAINT notification_rules_trigger_check
    CHECK ("trigger_event" IN (
      -- Stage 2.2.B Cp2 events
      'milestone_pre_invoice_due',
      'milestone_invoice_due',
      'milestone_overdue',
      'milestone_overdue_critical',
      'reservation_expiring',
      'contract_pending_signature',
      'late_fee_accrued',
      'discount_pending_approval',
      'system_event',
      -- Stage 2.3.B events
      'drawdown_overdue',
      'bank_balance_below_threshold',
      'project_self_sustaining_reached',
      'project_self_sustaining_lost',
      'bank_balance_discrepancy'
    ));
END $$;

COMMIT;
