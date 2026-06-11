-- =============================================================================
-- 0169 · PER-OWNER OPERATOR COMMISSION
--
-- WHY: the owner-onboard wizard (step 2) and the owner-detail "Edit
-- commission" modal both collect a commission %, but there was NOWHERE to
-- store it — recordCommissionChangeAction only wrote an append-only audit
-- event, so the statement engine could never read a per-owner rate and the
-- hub generator (statement-generation.ts) hard-coded 20%. The owner-detail
-- page even mislabelled the owner's lead ownership-share % as "commission".
--
-- WHAT (additive column on owners):
--   * commission_pct  numeric(6,4) NULL — the operator's commission as a
--     FRACTION in [0,1] (e.g. 0.2000 = 20%). NULL = "not set"; callers fall
--     back to the 20% platform default. Storing a fraction (not 0-100) keeps
--     it shape-compatible with owner_statements.operator_commission_pct, which
--     the statement engines already persist/read as a fraction.
--
-- Single-tenant today; the column starts NULL on every existing row, so this
-- is fully behaviour-preserving (every existing statement keeps its 20%
-- default). Additive only — no destructive change.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS commission_pct numeric(6, 4);

COMMIT;
