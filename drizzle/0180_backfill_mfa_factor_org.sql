-- =============================================================================
-- 0180 · TENANCY (MFA) — backfill organization_id on auth_mfa_factors (and
--        auth_mfa_recovery_codes) whose nullable organization_id (added by
--        migration 0154) was never stamped by the enrolment INSERT path.
--
-- Newly-created factors landed org=NULL and, via the admin reader's prior
-- isNull tolerance (or(eq, isNull)), surfaced on EVERY org's MFA admin page —
-- a cross-tenant leak. The enrolment path now stamps organization_id (derived
-- from app_users.organization_id, which is NOT NULL) and listMfaFactorsForAdmin
-- is tightened to a strict eq(organization_id). This migration repairs the
-- EXISTING NULL-org rows so the now-strict reader still surfaces legacy factors
-- to their own admins.
--
-- Idempotent: every UPDATE is scoped to `organization_id IS NULL`, so a re-run
-- is a no-op once rows are stamped. app_users.organization_id is NOT NULL and
-- every factor/recovery-code has a NOT NULL app_user_id FK, so the join always
-- resolves an org. No schema change here — the columns already exist (0154).
-- =============================================================================

BEGIN;

-- 1) auth_mfa_factors → org of the owning app_user.
UPDATE auth_mfa_factors f
   SET organization_id = u.organization_id
  FROM app_users u
 WHERE f.app_user_id = u.id
   AND f.organization_id IS NULL;

-- 2) auth_mfa_recovery_codes → same org anchor (nullable org + NOT NULL
--    app_user_id, identical to the factors table).
UPDATE auth_mfa_recovery_codes c
   SET organization_id = u.organization_id
  FROM app_users u
 WHERE c.app_user_id = u.id
   AND c.organization_id IS NULL;

COMMIT;
