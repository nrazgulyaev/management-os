-- Stage 8.F.1 — Provisioning pipeline fix
-- ============================================================================
--
-- BLOCKING bug surfaced by manual prod schema audit:
--   - auth.users contained 2 rows (founder + audit-bot)
--   - app_users contained 0 rows
--   → Every mutation returned "not authorized" because RBAC checks join through
--     app_users + user_roles, both empty.
--
-- This migration:
--   1. Adds provision_app_user() — idempotent, atomic, reusable from the new
--      /api/onboarding/start endpoint.
--   2. Backfills missing app_users for every auth.users row that lacks one,
--      tying them to the existing `ARCONIQUE_DEFAULT` organization (seeded
--      by 0071) and granting super_admin via user_roles + 'admin' via
--      app_user_roles.
--   3. Logs every backfill action to audit_events.
--
-- Schema reality:
--   - `app_users.organization_id` is NOT NULL with FK to organizations
--     (added in 0071 — earlier audit notes that claimed otherwise were wrong).
--   - The function takes the org id as a required parameter; the backfill
--     loop resolves ARCONIQUE_DEFAULT once and reuses it for every row.
--
-- Function signature (NEW — note the added p_organization_id):
--   provision_app_user(
--     p_auth_user_id          uuid,
--     p_email                 text,
--     p_full_name             text,
--     p_organization_id       uuid,
--     p_role_key_internal     text DEFAULT 'super_admin',
--     p_role_key_cabinet      text DEFAULT 'admin'
--   ) RETURNS uuid
--
-- IMPORTANT: depends on `public.assign_user_role()` from 0004 + the
-- ARCONIQUE_DEFAULT organization seeded by 0071.
--
-- IDEMPOTENT: re-running is a no-op.
-- ============================================================================

BEGIN;

-- Drop any prior provision_app_user() overloads so the function is the
-- one with the canonical (auth_user_id, email, full_name, organization_id,
-- role_key_internal, role_key_cabinet) signature only.
DROP FUNCTION IF EXISTS public.provision_app_user(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.provision_app_user(uuid, text, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.provision_app_user(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_organization_id uuid,
  p_role_key_internal text DEFAULT 'super_admin',
  p_role_key_cabinet  text DEFAULT 'admin'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_user_id uuid;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'provision_app_user: p_auth_user_id is required';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'provision_app_user: p_email is required';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'provision_app_user: p_organization_id is required';
  END IF;

  -- Idempotent app_users insert.
  SELECT id INTO v_app_user_id
    FROM public.app_users
   WHERE auth_user_id = p_auth_user_id;

  IF v_app_user_id IS NULL THEN
    -- Email may already exist as a pre-provisioned (auth-less) row — link
    -- it to this auth user instead of inserting a duplicate.
    SELECT id INTO v_app_user_id
      FROM public.app_users
     WHERE lower(email) = lower(p_email)
       AND auth_user_id IS NULL
     LIMIT 1;
    IF v_app_user_id IS NOT NULL THEN
      UPDATE public.app_users
         SET auth_user_id  = p_auth_user_id,
             organization_id = COALESCE(organization_id, p_organization_id),
             full_name     = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
             updated_at    = now()
       WHERE id = v_app_user_id;
    ELSE
      INSERT INTO public.app_users (
        auth_user_id, email, full_name, organization_id, status, timezone
      ) VALUES (
        p_auth_user_id,
        p_email,
        COALESCE(NULLIF(trim(p_full_name), ''), p_email),
        p_organization_id,
        'active',
        'Asia/Makassar'
      ) RETURNING id INTO v_app_user_id;
    END IF;
  END IF;

  -- Idempotent grant via user_roles (drives is_internal_user() RLS bypass).
  IF p_role_key_internal IS NOT NULL THEN
    PERFORM public.assign_user_role(
      v_app_user_id, p_role_key_internal, NULL, NULL
    );
  END IF;

  -- Idempotent grant via app_user_roles (drives Stage 5.F cabinet routing).
  IF p_role_key_cabinet IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.app_user_roles
     WHERE user_id = v_app_user_id
       AND role_key = p_role_key_cabinet
       AND scope = 'company_wide'
       AND is_active = true
  ) THEN
    INSERT INTO public.app_user_roles (
      user_id, role_key, scope, is_primary, is_active
    ) VALUES (
      v_app_user_id, p_role_key_cabinet, 'company_wide', true, true
    );
  END IF;

  RETURN v_app_user_id;
END;
$$;

COMMENT ON FUNCTION public.provision_app_user IS 'Stage 8.F.1 — atomic, idempotent app_users + role grant. Used by /api/onboarding/start, scripts/bootstrap-admin.ts, and the 0087 backfill loop. Requires p_organization_id (NOT NULL FK on app_users.organization_id added in 0071).';

-- ---------------------------------------------------------------------------
-- 2. Backfill loop — every auth.users row without a matching app_users
--    becomes a super_admin tied to the ARCONIQUE_DEFAULT organization.
--    Production state at authoring time: 2 rows expected to backfill
--    (founder + audit-bot). The loop is open-ended so additional auth
--    users created in dev/staging since are picked up too.
--
--    If ARCONIQUE_DEFAULT doesn't exist (pre-Stage-5.J state), the
--    loop fails fast with a clear error rather than backfilling against
--    a NULL — that's the right safety call since 0071 is a hard
--    prerequisite.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_record RECORD;
  v_app_user_id uuid;
  v_full_name text;
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id
    FROM public.organizations
   WHERE organization_code = 'ARCONIQUE_DEFAULT'
   LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'provision_app_user backfill: ARCONIQUE_DEFAULT organization is missing — apply 0071 first.';
  END IF;

  FOR v_record IN
    SELECT au.id AS auth_user_id, au.email
      FROM auth.users au
      LEFT JOIN public.app_users u ON u.auth_user_id = au.id
     WHERE u.id IS NULL
       AND au.email IS NOT NULL
  LOOP
    -- Derive a sensible full_name from the email local-part.
    v_full_name := initcap(regexp_replace(split_part(v_record.email, '@', 1), '[._-]+', ' ', 'g'));

    v_app_user_id := public.provision_app_user(
      v_record.auth_user_id,
      v_record.email,
      v_full_name,
      v_org_id,
      'super_admin',
      'admin'
    );

    INSERT INTO public.audit_events (
      actor_user_id, action, entity_type, entity_id, after, metadata
    ) VALUES (
      v_app_user_id,
      'auth.app_user.backfilled',
      'app_user',
      v_app_user_id,
      jsonb_build_object(
        'email', v_record.email,
        'full_name', v_full_name,
        'organization_id', v_org_id,
        'role_internal', 'super_admin',
        'role_cabinet', 'admin'
      ),
      jsonb_build_object(
        'migration', '0087_provisioning_backfill',
        'reason', 'auth.users row had no matching app_users on first sign-in / bootstrap'
      )
    );

    RAISE NOTICE '[0087] backfilled app_user % for auth user % (% in org %)',
      v_app_user_id, v_record.auth_user_id, v_record.email, v_org_id;
  END LOOP;
END $$;

COMMIT;
