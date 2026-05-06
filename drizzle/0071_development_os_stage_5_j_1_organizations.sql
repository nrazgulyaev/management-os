-- =============================================================================
-- 0071 — Development OS · Stage 5.J.1 — Organizations Foundation
--
-- Adds:
--   - organizations         tenant registry; seeds ARCONIQUE_DEFAULT
--   - app_users.organization_id (NOT NULL, backfilled to ARCONIQUE_DEFAULT)
--   - current_user_organization_id() / is_in_user_organization() RLS helpers
--
-- Idempotent. Backfill is atomic — partial state impossible.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) organizations
-- =============================================================================

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "organization_code" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "display_name" TEXT,
  "description" TEXT,

  "organization_type" TEXT NOT NULL CHECK ("organization_type" IN (
    'arconique_internal', 'developer_client', 'partner_organization',
    'demo_test', 'archived'
  )),

  "country_code" TEXT NOT NULL DEFAULT 'ID',
  "region_code" TEXT,
  "primary_currency" TEXT NOT NULL DEFAULT 'IDR',
  "primary_language" TEXT NOT NULL DEFAULT 'en',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Makassar',

  "subscription_tier" TEXT NOT NULL DEFAULT 'internal' CHECK ("subscription_tier" IN (
    'internal', 'starter', 'professional', 'enterprise', 'custom'
  )),
  "subscription_started_at" DATE,
  "subscription_expires_at" DATE,

  "branding_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "enabled_modules" JSONB NOT NULL DEFAULT '[]'::jsonb,

  "max_users" INTEGER,
  "max_projects" INTEGER,
  "max_ai_agent_invocations_per_month" INTEGER,
  "max_storage_gb" NUMERIC(10,2),

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "archived_at" TIMESTAMPTZ,
  "archive_reason" TEXT,

  "notes" TEXT
);

CREATE INDEX IF NOT EXISTS "organizations_active_idx" ON "organizations"("is_active");
CREATE INDEX IF NOT EXISTS "organizations_type_idx" ON "organizations"("organization_type");
CREATE INDEX IF NOT EXISTS "organizations_subscription_idx" ON "organizations"("subscription_tier");

CREATE OR REPLACE FUNCTION "organizations_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_organizations_updated_at" ON "organizations";
CREATE TRIGGER "trg_organizations_updated_at"
  BEFORE UPDATE ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION "organizations_set_updated_at"();

-- Seed Arconique default organization (idempotent)
INSERT INTO "organizations" (
  organization_code, name, display_name, organization_type,
  country_code, region_code, primary_currency, primary_language, timezone,
  subscription_tier, enabled_modules
) VALUES (
  'ARCONIQUE_DEFAULT',
  'Arconique',
  'Arconique Real Estate Development',
  'arconique_internal',
  'ID', 'BALI', 'IDR', 'en', 'Asia/Makassar',
  'internal',
  '["all_modules"]'::jsonb
)
ON CONFLICT (organization_code) DO NOTHING;


-- =============================================================================
-- 2) app_users.organization_id (additive, backfilled, NOT NULL)
-- =============================================================================

ALTER TABLE "app_users"
  ADD COLUMN IF NOT EXISTS "organization_id" UUID REFERENCES "organizations"("id");

UPDATE "app_users"
   SET "organization_id" = (SELECT id FROM "organizations" WHERE organization_code = 'ARCONIQUE_DEFAULT')
 WHERE "organization_id" IS NULL;

ALTER TABLE "app_users"
  ALTER COLUMN "organization_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "app_users_organization_idx" ON "app_users"("organization_id");


-- =============================================================================
-- 3) RLS helper functions
-- =============================================================================

CREATE OR REPLACE FUNCTION current_user_organization_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT organization_id
  FROM app_users
  WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION current_user_organization_id() IS
  'Returns the organization_id of the current authenticated user. Used in RLS policies for multi-tenant isolation.';

REVOKE EXECUTE ON FUNCTION current_user_organization_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_user_organization_id() TO authenticated;


CREATE OR REPLACE FUNCTION is_in_user_organization(row_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    public.is_internal_user()
    AND (row_organization_id IS NULL OR row_organization_id = current_user_organization_id())
$$;

COMMENT ON FUNCTION is_in_user_organization(UUID) IS
  'Returns true if user is internal AND row belongs to user organization. Standard RLS predicate for multi-tenant Dev OS tables. NULL row_organization_id permits access (shared/system rows).';

REVOKE EXECUTE ON FUNCTION is_in_user_organization(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_in_user_organization(UUID) TO authenticated;


-- =============================================================================
-- 4) RLS on organizations table itself
-- =============================================================================

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_internal_read ON "organizations";
CREATE POLICY organizations_internal_read ON "organizations"
  FOR SELECT
  USING (public.is_internal_user());

DROP POLICY IF EXISTS organizations_internal_write ON "organizations";
CREATE POLICY organizations_internal_write ON "organizations"
  FOR ALL
  USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

COMMIT;
