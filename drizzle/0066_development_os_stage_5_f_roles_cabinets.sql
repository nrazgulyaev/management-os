-- =============================================================================
-- 0066 — Development OS · Stage 5.F — Role-Specific Cabinets
--
-- 2 new tables:
--   - app_user_roles        per-user role grants (10 keys, 1 primary)
--   - cabinet_preferences   per-user cabinet customization
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) app_user_roles
-- =============================================================================

CREATE TABLE IF NOT EXISTS "app_user_roles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,

  "role_key" TEXT NOT NULL CHECK ("role_key" IN (
    'marketing_staff', 'qs_analyst', 'procurement_manager',
    'warehouse_manager', 'site_supervisor', 'sales_manager',
    'project_manager', 'cfo_accountant', 'executive_ceo', 'admin'
  )),

  "scope" TEXT NOT NULL CHECK ("scope" IN ('company_wide', 'project_specific')),
  "scoped_project_id" UUID REFERENCES "projects"("id"),

  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,

  "granted_by" UUID REFERENCES "app_users"("id"),
  "granted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "revoked_at" TIMESTAMPTZ,
  "revoked_by" UUID REFERENCES "app_users"("id"),
  "revocation_reason" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "app_user_roles_user_idx" ON "app_user_roles"("user_id");
CREATE INDEX IF NOT EXISTS "app_user_roles_role_idx" ON "app_user_roles"("role_key");
CREATE INDEX IF NOT EXISTS "app_user_roles_active_idx"
  ON "app_user_roles"("is_active") WHERE "is_active" = TRUE;

-- Partial unique: only one primary active role per user.
CREATE UNIQUE INDEX IF NOT EXISTS "app_user_roles_primary_unique"
  ON "app_user_roles"("user_id")
  WHERE "is_primary" = TRUE AND "is_active" = TRUE;

CREATE OR REPLACE FUNCTION "app_user_roles_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_app_user_roles_updated_at" ON "app_user_roles";
CREATE TRIGGER "trg_app_user_roles_updated_at"
  BEFORE UPDATE ON "app_user_roles"
  FOR EACH ROW EXECUTE FUNCTION "app_user_roles_set_updated_at"();


-- =============================================================================
-- 2) cabinet_preferences
-- =============================================================================

CREATE TABLE IF NOT EXISTS "cabinet_preferences" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "user_id" UUID UNIQUE NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,

  "default_cabinet_key" TEXT,

  "cabinet_widget_preferences" JSONB NOT NULL DEFAULT '{}'::jsonb,

  "preferred_language" TEXT,
  "preferred_theme" TEXT,

  "notification_preferences" JSONB NOT NULL DEFAULT '{}'::jsonb,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION "cabinet_preferences_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_cabinet_preferences_updated_at" ON "cabinet_preferences";
CREATE TRIGGER "trg_cabinet_preferences_updated_at"
  BEFORE UPDATE ON "cabinet_preferences"
  FOR EACH ROW EXECUTE FUNCTION "cabinet_preferences_set_updated_at"();


-- =============================================================================
-- 3) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['app_user_roles', 'cabinet_preferences'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_read ON %I; '
      'CREATE POLICY internal_read ON %I FOR SELECT '
      'USING (public.is_internal_user());',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_write ON %I; '
      'CREATE POLICY internal_write ON %I FOR ALL '
      'USING (public.is_internal_user()) '
      'WITH CHECK (public.is_internal_user());',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
