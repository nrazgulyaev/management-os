-- Stage 11.A.1 — Per-day trial reminder dedupe
-- ============================================================================
--
-- Adds `organizations.last_trial_reminder_at timestamptz` so the daily
-- trial-expiry-reminder cron (Stage 10.L.3) can skip orgs already
-- reminded on the same day. Without this column, multiple cron firings
-- on the same day (manual triggers, retries, parallel envs) would
-- re-send.
--
-- Cron logic after this migration:
--   WHERE trial_status = 'active'
--     AND trial_ends_at BETWEEN now AND now + 3 days
--     AND (last_trial_reminder_at IS NULL
--          OR last_trial_reminder_at < date_trunc('day', now))
--
-- After successful send, the cron stamps last_trial_reminder_at = now.
--
-- Default NULL: existing orgs (whether in active trial or not) start
-- with no stamp. The first cron firing is treated as the first reminder.
--
-- Rollback:
--   ALTER TABLE organizations DROP COLUMN last_trial_reminder_at;

ALTER TABLE organizations
  ADD COLUMN last_trial_reminder_at timestamptz;

COMMENT ON COLUMN organizations.last_trial_reminder_at IS
  'Last time the trial-expiry-reminder cron emailed this org. NULL until the first reminder fires. Used by the cron to dedupe per-day. Stage 11.A.1.';
