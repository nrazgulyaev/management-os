-- AUTH-INVESTOR-1 — app_users_investors grant table.
-- Mirrors app_users_owners structure (access-grants.ts L20-48,
-- migration 0003) so the investor-portal auth path can stop being
-- impersonation-only.
--
-- One active grant per (app_user_id, investor_id, grant_type)
-- enforced via partial unique index.

BEGIN;

CREATE TABLE IF NOT EXISTS "app_users_investors" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "app_user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "investor_id" UUID NOT NULL REFERENCES "investors"("id") ON DELETE CASCADE,
  "grant_type" TEXT NOT NULL DEFAULT 'investor_portal',
  "status" TEXT NOT NULL DEFAULT 'active',
  "granted_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "granted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "revoked_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "revoked_at" TIMESTAMPTZ,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "app_users_investors_app_user_idx"
  ON "app_users_investors" ("app_user_id");
CREATE INDEX IF NOT EXISTS "app_users_investors_investor_idx"
  ON "app_users_investors" ("investor_id");
CREATE INDEX IF NOT EXISTS "app_users_investors_status_idx"
  ON "app_users_investors" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "app_users_investors_unique_active"
  ON "app_users_investors" ("app_user_id", "investor_id", "grant_type")
  WHERE "status" = 'active';

COMMIT;
