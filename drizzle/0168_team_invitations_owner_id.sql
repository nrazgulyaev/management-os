-- DOMAIN 2 — Team & access: owner-portal invitations.
--
-- 1) `team_invitations` carries the role_key for the cabinet grant created on
--    accept, but had NO way to record WHICH owner an owner-portal invite
--    should be linked to. Without it, the owner-card "Invite to portal" button
--    could only write an audit-only stub (no real grant on accept).
--
--    This adds a nullable `owner_id` column (FK → owners, ON DELETE SET NULL so
--    deleting an owner never breaks a historical invitation row). When set, the
--    invitation is an owner-portal invite: on accept the runtime creates the
--    real `app_users_owners` grant (grant_type = owner_portal) and provisions
--    the app_user with the `investor_owner` cabinet role.
--
-- 2) Two role_key CHECK constraints only allowed the 10 Dev-OS cabinet roles:
--      - team_invitations.role_key  → must also accept 'owner' (the new
--        owner-portal invite intent).
--      - app_user_roles.role_key    → must also accept 'investor_owner' (the
--        cabinet role provision_app_user inserts for an accepted owner invite).
--    We WIDEN both CHECKs (drop + re-add a superset). Widening an allow-list is
--    additive / non-destructive — every previously-valid row stays valid.
--
-- Single-tenant today (all rows = ARCONIQUE_DEFAULT); owner_id starts NULL on
-- every existing row, so this is behaviour-preserving. Additive only.
-- Idempotent: ADD COLUMN/INDEX IF NOT EXISTS + DROP CONSTRAINT IF EXISTS.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. owner_id linkage column.
-- ---------------------------------------------------------------------------
ALTER TABLE "team_invitations"
  ADD COLUMN IF NOT EXISTS "owner_id" UUID
    REFERENCES "owners"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "team_invitations_owner_idx"
  ON "team_invitations" ("owner_id");

-- ---------------------------------------------------------------------------
-- 2a. Widen team_invitations.role_key to allow the owner-portal intent.
--     The inline CHECK from migration 0088 is auto-named
--     `team_invitations_role_key_check`. Drop it (if present, under either the
--     conventional name or our explicit name) and re-add the widened superset.
-- ---------------------------------------------------------------------------
ALTER TABLE "team_invitations"
  DROP CONSTRAINT IF EXISTS "team_invitations_role_key_check";
ALTER TABLE "team_invitations"
  DROP CONSTRAINT IF EXISTS "team_invitations_role_key_allowed";
ALTER TABLE "team_invitations"
  ADD CONSTRAINT "team_invitations_role_key_allowed" CHECK ("role_key" IN (
    'marketing_staff', 'qs_analyst', 'procurement_manager',
    'warehouse_manager', 'site_supervisor', 'sales_manager',
    'project_manager', 'cfo_accountant', 'executive_ceo', 'admin',
    'owner'
  ));

-- ---------------------------------------------------------------------------
-- 2b. Widen app_user_roles.role_key to allow investor_owner (the cabinet role
--     provisioned for an accepted owner-portal invitation). The inline CHECK
--     from migration 0066 is auto-named `app_user_roles_role_key_check`.
-- ---------------------------------------------------------------------------
ALTER TABLE "app_user_roles"
  DROP CONSTRAINT IF EXISTS "app_user_roles_role_key_check";
ALTER TABLE "app_user_roles"
  DROP CONSTRAINT IF EXISTS "app_user_roles_role_key_allowed";
ALTER TABLE "app_user_roles"
  ADD CONSTRAINT "app_user_roles_role_key_allowed" CHECK ("role_key" IN (
    'marketing_staff', 'qs_analyst', 'procurement_manager',
    'warehouse_manager', 'site_supervisor', 'sales_manager',
    'project_manager', 'cfo_accountant', 'executive_ceo', 'admin',
    'investor_owner'
  ));

COMMIT;
