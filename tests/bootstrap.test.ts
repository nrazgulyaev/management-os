/**
 * node:test smoke coverage for the /setup/admin-bootstrap fix (migration 0004).
 *
 * Heavy DB integration (real Postgres + RLS) lands in v4 once we wire
 * pgtap/Playwright. These tests focus on the contract pieces we can verify
 * statically (the bootstrap module itself imports `server-only`, which only
 * resolves inside the Next runtime — out of scope for node:test):
 *   1. Migration 0004 SQL has the right shape (drops composite PK, adds the
 *      surrogate id, UNIQUE NULLS NOT DISTINCT, assign_user_role function,
 *      and the bootstrap RLS policies).
 *   2. The Drizzle schema for user_roles exposes a surrogate id PK and no
 *      longer relies on the composite PK that forced NOT NULL on the scope
 *      columns.
 *   3. The super_admin role grants finance.issue_statement; an unroled user
 *      cannot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

test("migration 0004 reshapes user_roles for nullable scopes", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0004_bootstrap_user_roles_fix.sql"),
    "utf8",
  );

  // PK gymnastics
  assert.match(sql, /DROP CONSTRAINT/i, "drops the existing PK");
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS\s+"id"\s+uuid\s+NOT NULL\s+DEFAULT\s+gen_random_uuid\(\)/i,
    "adds surrogate id column",
  );
  assert.match(
    sql,
    /ADD CONSTRAINT\s+user_roles_pkey\s+PRIMARY KEY\s*\(\s*"id"\s*\)/i,
    "re-establishes a surrogate primary key",
  );

  // Scope columns must be droppable to NULL
  assert.match(
    sql,
    /ALTER COLUMN\s+"scope_type"\s+DROP NOT NULL/i,
    "scope_type becomes nullable",
  );
  assert.match(
    sql,
    /ALTER COLUMN\s+"scope_id"\s+DROP NOT NULL/i,
    "scope_id becomes nullable",
  );

  // UNIQUE NULLS NOT DISTINCT — the only way to keep (NULL, NULL) unique
  assert.match(
    sql,
    /UNIQUE NULLS NOT DISTINCT\s*\(\s*"user_id"\s*,\s*"role_id"\s*,\s*"scope_type"\s*,\s*"scope_id"\s*\)/i,
    "global-scope rows stay unique",
  );

  // SECURITY DEFINER helper used by the bootstrap server action
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION\s+public\.assign_user_role/i,
    "exposes assign_user_role()",
  );
  assert.match(sql, /SECURITY DEFINER/i, "function is SECURITY DEFINER");
  assert.match(
    sql,
    /IS NOT DISTINCT FROM/i,
    "matches null scope on lookup",
  );

  // Refreshed RLS — internal_read + super_admin_manage + bootstrap-first path
  assert.match(sql, /CREATE POLICY internal_read ON "user_roles"/);
  assert.match(sql, /CREATE POLICY super_admin_manage ON "user_roles"/);
  assert.match(sql, /CREATE POLICY bootstrap_first_super ON "user_roles"/);
});

test("user_roles drizzle schema exposes a surrogate id and unique-not-distinct", async () => {
  const { userRoles } = await import("../src/lib/db/schema/identity");
  // Drizzle stamps Column instances onto the table object. We only need to
  // verify the surrogate id exists and the scope columns are still there.
  assert.ok("id" in userRoles, "id column is present on the table");
  assert.ok("userId" in userRoles, "userId column is present");
  assert.ok("roleId" in userRoles, "roleId column is present");
  assert.ok("scopeType" in userRoles, "scopeType column is present");
  assert.ok("scopeId" in userRoles, "scopeId column is present");
});

test("super_admin can issue statements; an unroled user cannot", async () => {
  const { hasPermission } = await import(
    "../src/features/auth/permission-matrix"
  );
  const adminCtx = {
    mode: "live" as const,
    appUser: {
      id: "u",
      email: "admin@arconique.test",
      fullName: "Super Admin",
      status: "active",
    },
    roles: ["super_admin" as const],
    isInternal: true,
    isSuperAdmin: true,
  };
  const noRoleCtx = {
    mode: "live" as const,
    appUser: {
      id: "u2",
      email: "stranger@arconique.test",
      fullName: "No Role",
      status: "active",
    },
    roles: [],
    isInternal: false,
    isSuperAdmin: false,
  };

  assert.equal(hasPermission(adminCtx, "finance.issue_statement"), true);
  assert.equal(hasPermission(noRoleCtx, "finance.issue_statement"), false);
});
