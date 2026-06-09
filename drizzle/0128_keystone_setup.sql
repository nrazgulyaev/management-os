-- 0128 — Keystone first-run org setup (P0 design-live gap).
-- Two tables, both org-scoped + idempotent:
--   * onboarding_progress    — one row per org; the 3-step setup wizard's
--                              saved state (current step + dismissed flag).
--   * role_access_overrides  — per (org, cabinet, role) override of the
--                              hardcoded ROLE_CAPABILITIES "*.read" matrix.
--                              Drives the "who-sees-what" matrix editor.
-- No money columns. No PSP. Mirrors the style of 0124_turnovers.sql.

-- ---------------------------------------------------------------------------
-- onboarding_progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "onboarding_progress" (
  "organization_id" uuid PRIMARY KEY
    REFERENCES "organizations"("id") ON DELETE cascade,
  -- 1=villas, 2=projects, 3=team. 0 = welcome screen not yet started.
  "current_step" integer NOT NULL DEFAULT 0,
  -- TRUE once the admin clicks Finish (or Skip) — hides the welcome banner.
  "dismissed" boolean NOT NULL DEFAULT false,
  "completed_at" timestamptz,
  "updated_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- role_access_overrides
-- ---------------------------------------------------------------------------
-- A row exists ONLY when an admin has overridden the code default for a
-- (cabinet, role) cell. Absence of a row => fall back to ROLE_CAPABILITIES.
CREATE TABLE IF NOT EXISTS "role_access_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL
    REFERENCES "organizations"("id") ON DELETE cascade,
  -- cabinet prefix, e.g. 'finance', 'operations', 'bookings'.
  "cabinet" text NOT NULL,
  -- canonical RoleKey, e.g. 'director', 'finance_manager'.
  "role_key" text NOT NULL,
  -- the override value: can this role see this cabinet?
  "can_access" boolean NOT NULL,
  "updated_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "role_access_overrides_org_cabinet_role_uniq"
  ON "role_access_overrides" ("organization_id", "cabinet", "role_key");
CREATE INDEX IF NOT EXISTS "role_access_overrides_org_idx"
  ON "role_access_overrides" ("organization_id");
