-- =============================================================================
-- 0186 · TURNOVER-POLICY — per-org, editable turnover-times company policy.
--        One row per organization. Drives the turnover board window + (later)
--        the housekeeping-allocation SLA.
--
-- The turnover read layer (src/features/operations/turnover-queries.ts) used to
-- HARDCODE the property-standard window (STD_CHECKOUT '11:00', STD_CHECKIN
-- '14:00') because bookings store check_in/check_out as a DATE only and no
-- settings table carried a standard time. This table is that settings source —
-- an org sets its own default check-out / check-in clock + minimum turnover
-- (cleaning) window, read org-scoped via getTurnoverPolicy().
--
-- DEFAULT SAFETY: the column defaults below EXACTLY reproduce today's hardcoded
-- window (11:00 / 14:00 / 180 min = the 11:00→14:00 gap). An org with NO row
-- gets the same TURNOVER_POLICY_DEFAULTS object in code, so the board is
-- unchanged until an operator opts in.
--
-- FUTURE per-villa overrides: add a nullable villa_id FK + switch the unique
-- index to COALESCE(villa_id, sentinel) — mirrors 0183's statement-settings
-- scope pattern. No code churn for callers that pass villaId = null.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + guarded index. Safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS org_turnover_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,
  -- House-standard clock (NOT a per-booking fact). HH:MM[:SS].
  default_checkout_time time NOT NULL DEFAULT '11:00',
  default_checkin_time  time NOT NULL DEFAULT '14:00',
  -- Minimum cleaning/turnover window in minutes (SLA floor for same-day arrivals).
  min_turnover_minutes integer NOT NULL DEFAULT 180,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- One policy row per org (the upsert in updateTurnoverPolicyAction keys on this).
-- Unique INDEX (idempotent) rather than a table constraint so the migration
-- stays safely re-runnable.
CREATE UNIQUE INDEX IF NOT EXISTS org_turnover_policy_org_unique
  ON org_turnover_policy(organization_id);

COMMIT;
