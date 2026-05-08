-- Stage 9.D — team invitations
-- ============================================================================
--
-- Operators (admins) invite team members by email. The invitation lives in
-- this table until accepted / revoked / expired. Acceptance:
--   1. Recipient clicks the link → /accept-invitation/[token]
--   2. We verify token + expiration + status='pending'
--   3. If recipient has no auth.users row, we create one (Supabase admin API).
--   4. Call provision_app_user(...) to create app_users + grant the role
--      saved on the invitation.
--   5. Mark invitation accepted_at = now(), status = 'accepted'.
--
-- The token is a 32-byte URL-safe random value. Stored as text. Indexed
-- unique. Only valid while status='pending' AND expires_at > now().
--
-- Org scoping: every invitation carries organization_id so RLS keeps each
-- org's invitations isolated. Inviter (granted_by) is the app_users.id of
-- the operator who clicked "Invite".
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "team_invitations" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_key text NOT NULL CHECK (role_key IN (
    'marketing_staff', 'qs_analyst', 'procurement_manager',
    'warehouse_manager', 'site_supervisor', 'sales_manager',
    'project_manager', 'cfo_accountant', 'executive_ceo', 'admin'
  )),
  scope text NOT NULL DEFAULT 'company_wide' CHECK (scope IN ('company_wide', 'project_specific')),
  scoped_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  invited_by_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  resent_count int NOT NULL DEFAULT 0,
  last_email_sent_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Same email can be re-invited after a previous invitation lapses; we
  -- prevent duplicate ACTIVE invitations via a partial unique index below.
  CONSTRAINT team_invitations_scope_proj_check
    CHECK ((scope = 'project_specific') = (scoped_project_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS team_invitations_org_idx
  ON "team_invitations"(organization_id);
CREATE INDEX IF NOT EXISTS team_invitations_email_idx
  ON "team_invitations"(lower(email));
CREATE INDEX IF NOT EXISTS team_invitations_status_idx
  ON "team_invitations"(status);
-- Only one ACTIVE invitation per (org, email) at a time.
CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_active_uniq
  ON "team_invitations"(organization_id, lower(email))
  WHERE status = 'pending';

-- RLS — same pattern Stage 7.B's subscription tables use.
ALTER TABLE "team_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_invitations" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'team_invitations'
       AND policyname = 'team_invitations_org_isolation'
  ) THEN
    EXECUTE 'CREATE POLICY team_invitations_org_isolation ON "team_invitations" ' ||
            'FOR ALL ' ||
            'USING (public.is_in_user_organization(organization_id)) ' ||
            'WITH CHECK (public.is_in_user_organization(organization_id))';
  END IF;
END $$;

-- Internal-user bypass — admins / super_admins can read invitations across
-- their assigned orgs (mirrors the pattern on subscription tables).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'team_invitations'
       AND policyname = 'team_invitations_internal_bypass'
  ) THEN
    EXECUTE 'CREATE POLICY team_invitations_internal_bypass ON "team_invitations" ' ||
            'FOR ALL ' ||
            'USING (public.is_internal_user()) ' ||
            'WITH CHECK (public.is_internal_user())';
  END IF;
END $$;

COMMIT;
