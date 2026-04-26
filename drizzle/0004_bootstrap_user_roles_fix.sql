-- Arconique Management OS — Migration 0004
-- · Fixes the /setup/admin-bootstrap runtime error: insert into "user_roles"
--   failed because scope_type / scope_id were part of the composite PRIMARY
--   KEY, which Postgres silently makes NOT NULL.
-- · Replaces the composite PK with a surrogate `id`, drops the implicit
--   NOT NULL on the scope columns, and adds a UNIQUE NULLS NOT DISTINCT
--   constraint so a user can hold the same role only once per (scope_type,
--   scope_id) tuple — including the global (NULL, NULL) scope.
-- · Adds public.assign_user_role() — a SECURITY DEFINER, idempotent helper
--   the bootstrap server action calls so the first super_admin can be linked
--   even before any RLS-passing identity exists in the session.
-- · Refreshes RLS on user_roles: internal staff manages all rows; an open
--   "first super_admin" path exists only while no super_admin row exists.
-- Idempotent on re-run.

BEGIN;

-- =============================================================================
-- 1) Drop the composite PRIMARY KEY (also drops the implicit NOT NULL on the
--    scope columns) and add a surrogate id.
-- =============================================================================
DO $$
DECLARE pk_name text;
BEGIN
  SELECT conname INTO pk_name
    FROM pg_constraint
   WHERE conrelid = 'public.user_roles'::regclass
     AND contype = 'p';
  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_roles DROP CONSTRAINT %I', pk_name);
  END IF;
END $$;

ALTER TABLE "user_roles"
  ADD COLUMN IF NOT EXISTS "id" uuid NOT NULL DEFAULT gen_random_uuid();

-- Re-establish a primary key on the surrogate id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.user_roles'::regclass
       AND contype = 'p'
  ) THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT user_roles_pkey PRIMARY KEY ("id");
  END IF;
END $$;

-- Belt-and-braces: explicitly drop NOT NULL on the scope columns. Postgres
-- already cleared these when the composite PK went, but on databases that
-- pre-date this migration without ever holding the composite PK (none in
-- prod, but theoretically possible in dev) this keeps things deterministic.
ALTER TABLE "user_roles" ALTER COLUMN "scope_type" DROP NOT NULL;
ALTER TABLE "user_roles" ALTER COLUMN "scope_id"   DROP NOT NULL;

-- =============================================================================
-- 2) UNIQUE NULLS NOT DISTINCT — one role assignment per (user, role, scope).
--    NULLS NOT DISTINCT (PG15+) treats NULL = NULL, so the global scope row
--    (scope_type=NULL, scope_id=NULL) is unique too.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_roles_user_role_scope_uniq'
       AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE "user_roles"
      ADD CONSTRAINT user_roles_user_role_scope_uniq
      UNIQUE NULLS NOT DISTINCT ("user_id", "role_id", "scope_type", "scope_id");
  END IF;
END $$;

-- =============================================================================
-- 3) public.assign_user_role(p_user_id, p_role_key, p_scope_type, p_scope_id)
--    Idempotent SECURITY DEFINER helper. Returns the user_roles.id (existing
--    or newly inserted). Uses IS NOT DISTINCT FROM so NULL scopes match.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assign_user_role(
  p_user_id    uuid,
  p_role_key   text,
  p_scope_type text DEFAULT NULL,
  p_scope_id   uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_id      uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'assign_user_role: p_user_id is required';
  END IF;
  IF p_role_key IS NULL OR length(trim(p_role_key)) = 0 THEN
    RAISE EXCEPTION 'assign_user_role: p_role_key is required';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE key = p_role_key;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'assign_user_role: unknown role key %', p_role_key;
  END IF;

  SELECT id INTO v_id
    FROM public.user_roles
   WHERE user_id    = p_user_id
     AND role_id    = v_role_id
     AND scope_type IS NOT DISTINCT FROM p_scope_type
     AND scope_id   IS NOT DISTINCT FROM p_scope_id
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.user_roles (user_id, role_id, scope_type, scope_id)
  VALUES (p_user_id, v_role_id, p_scope_type, p_scope_id)
  ON CONFLICT ON CONSTRAINT user_roles_user_role_scope_uniq DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.user_roles
     WHERE user_id    = p_user_id
       AND role_id    = v_role_id
       AND scope_type IS NOT DISTINCT FROM p_scope_type
       AND scope_id   IS NOT DISTINCT FROM p_scope_id
     LIMIT 1;
  END IF;

  RETURN v_id;
END
$$;

-- =============================================================================
-- 4) RLS on user_roles — was relying on the table-wide internal_read loop in
--    0000, which only granted SELECT. Bootstrap also needs INSERT, and only
--    the very-first super_admin row should be insertable without an existing
--    internal session (chicken-and-egg).
-- =============================================================================
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_read         ON "user_roles";
DROP POLICY IF EXISTS super_admin_manage    ON "user_roles";
DROP POLICY IF EXISTS bootstrap_first_super ON "user_roles";

-- Internal staff can read every assignment.
CREATE POLICY internal_read ON "user_roles" FOR SELECT
USING (public.is_internal_user());

-- Super admins (and only super admins) can write to user_roles directly.
-- Everything else funnels through public.assign_user_role() / server actions
-- running with the service role.
CREATE POLICY super_admin_manage ON "user_roles" FOR ALL
USING (
  EXISTS (
    SELECT 1
      FROM public.app_users u
      JOIN public.user_roles ur ON ur.user_id = u.id
      JOIN public.roles r       ON r.id       = ur.role_id
     WHERE u.auth_user_id = auth.uid()
       AND u.status = 'active'
       AND r.key = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
      FROM public.app_users u
      JOIN public.user_roles ur ON ur.user_id = u.id
      JOIN public.roles r       ON r.id       = ur.role_id
     WHERE u.auth_user_id = auth.uid()
       AND u.status = 'active'
       AND r.key = 'super_admin'
  )
);

-- The very first super_admin row is allowed without a pre-existing session,
-- but ONLY while no super_admin currently exists. Once the first row lands,
-- this policy stops matching new rows.
CREATE POLICY bootstrap_first_super ON "user_roles" FOR INSERT
WITH CHECK (
  NOT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE r.key = 'super_admin'
  )
  AND EXISTS (
    SELECT 1 FROM public.roles r
     WHERE r.id = role_id AND r.key = 'super_admin'
  )
);

COMMIT;
