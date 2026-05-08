-- Stage 9.G followup — tighten Stage 5.J cross-org RLS policies
-- ============================================================================
--
-- Five tables shipped in Stage 5.J (multi-tenant API foundation) ship with
-- `is_internal_user()`-only policies that pre-date the
-- `is_in_user_organization` helper introduced in 0071. With those policies
-- alone, ANY user holding one of the 10 internal role keys would see
-- every tenant's API keys, request logs, webhooks, usage metrics, and
-- export requests — not just their own org's. Cross-org leak.
--
-- Surfaced by Stage 9.G (`tests/development-stage-9-g.test.ts`).
-- Documented at `tmp/stage-5-j-rls-gap.md`.
--
-- This migration replaces the existing `internal_read` + `internal_write`
-- policies on those 5 tables with the canonical pair Stage 7.B
-- (subscriptions) + Stage 9.D (team_invitations) use:
--
--   `org_isolation`     — USING is_in_user_organization(organization_id)
--                         WITH CHECK is_in_user_organization(organization_id)
--   `internal_bypass`   — USING is_internal_user()
--                         WITH CHECK is_internal_user()
--
-- The `internal_bypass` preserves Arconique HQ's cross-org access for the
-- super_admin / director / operations_manager roles — the standard
-- pattern across the rest of the codebase. The new `org_isolation`
-- closes the leak: regular tenant users only see their own org's rows.
--
-- IDEMPOTENT: re-running is a no-op (policies are dropped first, then
-- created). Wrapped in BEGIN/COMMIT.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'api_keys',
    'api_request_log',
    'webhook_subscriptions',
    'usage_metrics',
    'data_export_requests'
  ]
  LOOP
    -- Drop the legacy internal-only policies. Both names existed in
    -- Stage 5.J as separate SELECT + ALL policies.
    EXECUTE format('DROP POLICY IF EXISTS internal_read ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS internal_write ON %I;', t);

    -- Also drop org_isolation / internal_bypass if a re-run lands on a
    -- partially-applied state.
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS internal_bypass ON %I;', t);

    -- Org isolation — regular tenant users see only their org's rows.
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I FOR ALL ' ||
      'USING (public.is_in_user_organization(organization_id)) ' ||
      'WITH CHECK (public.is_in_user_organization(organization_id));',
      t
    );

    -- Internal bypass — Arconique HQ retains cross-org visibility for
    -- support / oncall / platform admin. Same shape as Stage 7.B
    -- subscription tables and Stage 9.D team_invitations.
    EXECUTE format(
      'CREATE POLICY internal_bypass ON %I FOR ALL ' ||
      'USING (public.is_internal_user()) ' ||
      'WITH CHECK (public.is_internal_user());',
      t
    );

    RAISE NOTICE '[0089] tightened RLS on %', t;
  END LOOP;
END $$;

COMMIT;
