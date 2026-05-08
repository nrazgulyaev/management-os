/**
 * Stage 9.E — Role assignment UI acceptance tests.
 *
 * Static / file-presence tests cover the action contract, the member
 * detail page, the role-change form, and the role-descriptions
 * module.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ROLE_DESCRIPTIONS } from "../src/features/team/role-descriptions";
import { VALID_CABINET_ROLES } from "../src/features/team/role-keys";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ============================================================================
// Role keys + descriptions (pure constants)
// ============================================================================

test("9.E: VALID_CABINET_ROLES exports all 10 keys from migration 0066's CHECK", () => {
  const expected = [
    "marketing_staff",
    "qs_analyst",
    "procurement_manager",
    "warehouse_manager",
    "site_supervisor",
    "sales_manager",
    "project_manager",
    "cfo_accountant",
    "executive_ceo",
    "admin",
  ].sort();
  const actual = [...VALID_CABINET_ROLES].sort();
  assert.deepStrictEqual(actual, expected);
});

test("9.E: ROLE_DESCRIPTIONS covers every role + each entry is operator-meaningful", () => {
  for (const k of VALID_CABINET_ROLES) {
    const desc = ROLE_DESCRIPTIONS[k];
    assert.ok(desc, `missing description for ${k}`);
    assert.ok(desc.label.length > 0, `${k}: label is required`);
    assert.ok(desc.blurb.length > 30, `${k}: blurb too short — must be informative`);
    assert.ok(
      desc.highlights.length >= 2,
      `${k}: needs at least 2 highlight bullets so the picker is actionable`,
    );
  }
});

// ============================================================================
// Server action contract
// ============================================================================

test("9.E: updateUserRoleAction exported from features/team/actions.ts", () => {
  const src = read("src/features/team/actions.ts");
  assert.match(src, /^"use server"/m);
  assert.match(src, /export async function updateUserRoleAction\b/);
  // Permission gate.
  assert.match(src, /requirePermission\("roles\.assign"\)/);
});

test("9.E: updateUserRoleAction enforces the last-active-admin invariant", () => {
  const src = read("src/features/team/actions.ts");
  assert.match(
    src,
    /Cannot demote the last active admin/i,
    "Action must refuse demoting the last active admin",
  );
});

test("9.E: updateUserRoleAction refuses self-change", () => {
  const src = read("src/features/team/actions.ts");
  assert.match(src, /You cannot change your own role/i);
});

test("9.E: updateUserRoleAction soft-deletes prior grants + inserts a new one", () => {
  const src = read("src/features/team/actions.ts");
  // Mark old grants is_active=false.
  assert.match(src, /\.update\(appUserRoles\)/);
  assert.match(src, /isActive:\s*false/);
  assert.match(src, /revokedAt:\s*now/);
  // Insert the new active grant.
  assert.match(src, /\.insert\(appUserRoles\)\.values\(/);
  assert.match(src, /isActive:\s*true/);
});

test("9.E: updateUserRoleAction logs team.user.role_changed audit event", () => {
  const src = read("src/features/team/actions.ts");
  assert.match(src, /"team\.user\.role_changed"/);
  // before/after payloads carry role context.
  assert.match(src, /role_keys/);
});

test("9.E: updateUserRoleAction does NOT touch user_roles (super_admin reserved)", () => {
  const src = read("src/features/team/actions.ts");
  // Find the updateUserRoleAction body and assert no inserts/updates on userRoles.
  const startIdx = src.indexOf("updateUserRoleAction");
  assert.ok(startIdx > 0);
  const body = src.slice(startIdx);
  assert.doesNotMatch(
    body,
    /\.insert\(userRoles\)|\.update\(userRoles\)/,
    "updateUserRoleAction must NOT mutate user_roles — that table is reserved for the founder + audit-bot super_admin grants",
  );
});

test("9.E: updateUserRoleAction reactivates suspended users on grant", () => {
  const src = read("src/features/team/actions.ts");
  // After granting the new role, suspended → active.
  assert.match(src, /status === "suspended"/);
  assert.match(src, /status:\s*"active"/);
});

// ============================================================================
// Member detail page + change-role form
// ============================================================================

test("9.E: /dashboard/settings/team/[user_id]/page.tsx renders + uses force-dynamic", () => {
  const path =
    "src/app/(dashboard)/dashboard/settings/team/[user_id]/page.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  // Page reads identity + grants.
  assert.match(src, /from\(appUsers\)/);
  assert.match(src, /from\(appUserRoles\)/);
  // Renders the change-role form with current role context.
  assert.match(src, /<ChangeRoleForm/);
  // Surfaces history (revoked + superseded grants).
  assert.match(src, /historyGrants/);
});

test("9.E: change-role-form is a client component + posts to updateUserRoleAction", () => {
  const path =
    "src/app/(dashboard)/dashboard/settings/team/[user_id]/change-role-form.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^"use client"/m);
  assert.match(src, /updateUserRoleAction\(/);
  // Picker renders all 10 roles via the canonical constant — keeps the
  // form in sync with the CHECK constraint.
  assert.match(src, /VALID_CABINET_ROLES/);
  // Help drawer shows the description + highlights.
  assert.match(src, /selectedDesc\.highlights/);
});

test("9.E: team list page links to /dashboard/settings/team/<id>", () => {
  const src = read("src/app/(dashboard)/dashboard/settings/team/page.tsx");
  assert.match(src, /\/dashboard\/settings\/team\/\$\{u\.id\}/);
  assert.match(src, /Manage/);
});

// ============================================================================
// Phase 9.E closure
// ============================================================================

test("Phase 9.E: no new migrations", () => {
  // 9.E is action + UI only; no schema changes.
  assert.ok(
    !exists("drizzle/0089_development_os_stage_9_e.sql"),
    "Phase 9.E is action + UI only — no migration expected",
  );
});
