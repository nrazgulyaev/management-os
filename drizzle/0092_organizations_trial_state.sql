-- Stage 10.I.5 — Trial state machine on organizations
-- ============================================================================
--
-- Adds trial tracking to the organizations table. New orgs created via
-- /signup (Stage 10.I.5) get trial_started_at = now() + trial_ends_at =
-- now() + 14 days + trial_status = 'active'. Existing orgs (provisioned
-- before this stage) get trial_status = 'none' (the default) and never
-- enter the trial machine.
--
-- State transitions:
--   none      → (signup)        → active
--   active    → (cron, expiry)  → expired
--   active    → (Stripe in 10.L) → converted
--   active    → (operator)      → cancelled
--   expired   → (Stripe in 10.L) → converted
--
-- Cron at /api/cron/trial-status (Stage 10.I.6) flips
-- 'active' → 'expired' daily for rows where trial_ends_at < now().
--
-- Index on trial_status filters the cron's nightly scan + lets the
-- /no-product-access guard short-circuit cheaply for paid orgs.
--
-- Rollback:
--   DROP INDEX IF EXISTS organizations_trial_status_idx;
--   ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_trial_status_check;
--   ALTER TABLE organizations DROP COLUMN trial_status;
--   ALTER TABLE organizations DROP COLUMN trial_ends_at;
--   ALTER TABLE organizations DROP COLUMN trial_started_at;

ALTER TABLE organizations
  ADD COLUMN trial_started_at timestamptz,
  ADD COLUMN trial_ends_at    timestamptz,
  ADD COLUMN trial_status     text NOT NULL DEFAULT 'none';

ALTER TABLE organizations
  ADD CONSTRAINT organizations_trial_status_check
    CHECK (trial_status IN ('none','active','expired','converted','cancelled'));

-- Partial index on active + expired rows only — cron filters to those.
CREATE INDEX IF NOT EXISTS organizations_trial_status_idx
  ON organizations (trial_status)
  WHERE trial_status IN ('active','expired');

COMMENT ON COLUMN organizations.trial_started_at IS
  'When the trial began. NULL when trial_status=''none''. Stage 10.I.5.';
COMMENT ON COLUMN organizations.trial_ends_at IS
  'When the trial expires. NULL when trial_status=''none''. Stage 10.I.5.';
COMMENT ON COLUMN organizations.trial_status IS
  'Trial state machine: none|active|expired|converted|cancelled. Stage 10.I.5.';
