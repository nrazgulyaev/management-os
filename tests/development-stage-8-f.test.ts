/**
 * Stage 8.F — Provisioning pipeline fix acceptance tests.
 *
 * Static / file-presence tests live here; they run without a DB and
 * guard the contract (migration shape, endpoint shape, bootstrap-admin
 * verification block, etc.). The DB-bound invariant tests live in
 * `tests/invariants/provisioning.test.ts` and are gated on
 * `DATABASE_URL` being set.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

// ===========================================================================
// 8.F.1 — migration shape
// ===========================================================================

test("8.F.1: migration 0087_provisioning_backfill exists", () => {
  assert.ok(exists("drizzle/0087_provisioning_backfill.sql"));
});

test("8.F.1: migration declares provision_app_user() with idempotent semantics", () => {
  const src = read("drizzle/0087_provisioning_backfill.sql");
  // Function declaration.
  assert.match(src, /CREATE OR REPLACE FUNCTION public\.provision_app_user\b/);
  // SECURITY DEFINER (privileged context — backfill needs to bypass RLS).
  assert.match(src, /SECURITY DEFINER/);
  // Sets search_path to avoid hijack via shadowing.
  assert.match(src, /SET search_path = public/);
  // Idempotent: returns existing id when already provisioned.
  assert.match(src, /SELECT id INTO v_app_user_id\s*\n\s*FROM public\.app_users/);
  // Grants both internal (user_roles via assign_user_role) AND cabinet (app_user_roles).
  assert.match(src, /assign_user_role\(/);
  assert.match(src, /INSERT INTO public\.app_user_roles/);
});

test("8.F.1: migration backfills auth.users without app_users entries", () => {
  const src = read("drizzle/0087_provisioning_backfill.sql");
  // Looping construct over the gap.
  assert.match(src, /FROM auth\.users au/);
  assert.match(src, /LEFT JOIN public\.app_users u ON u\.auth_user_id = au\.id/);
  assert.match(src, /WHERE u\.id IS NULL/);
  // Calls the helper — keeps the loop body small + reuses the same
  // path /api/onboarding/start uses.
  assert.match(src, /provision_app_user\(/);
  // Audit-logs every backfill.
  assert.match(src, /INSERT INTO public\.audit_events/);
  assert.match(src, /'auth\.app_user\.backfilled'/);
});

test("8.F.1: migration is idempotent (whole thing wrapped in BEGIN/COMMIT)", () => {
  const src = read("drizzle/0087_provisioning_backfill.sql");
  assert.match(src, /^BEGIN;$/m);
  assert.match(src, /^COMMIT;$/m);
});

// ===========================================================================
// 8.F.2 — bootstrap-admin verification
// ===========================================================================

test("8.F.2: bootstrap-admin.ts verifies app_users + user_roles after link", () => {
  const src = read("scripts/bootstrap-admin.ts");
  // Reads app_users to confirm the row exists.
  assert.match(src, /\.from\(appUsers\)/);
  // Reads user_roles + roles to confirm super_admin grant landed.
  assert.match(src, /\.from\(userRoles\)/);
  assert.match(src, /super_admin/);
  // Exits non-zero on verification failure (separate from Bootstrap failure).
  assert.match(src, /process\.exit\(2\)/);
});

test("8.F.2: bootstrap-admin.ts soft-warns on missing app_user_roles grant", () => {
  const src = read("scripts/bootstrap-admin.ts");
  // The cabinet grant is provisioned by 0087 OR /api/onboarding/start, NOT by
  // bootstrap-admin itself, so its absence is a soft warning, not a fatal exit.
  assert.match(src, /\.from\(appUserRoles\)/);
  assert.match(src, /console\.warn/);
});

// ===========================================================================
// 8.F.3 — /api/onboarding/start endpoint
// ===========================================================================

test("8.F.3: /api/onboarding/start route file exists + handles POST", () => {
  const path = "src/app/api/onboarding/start/route.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export async function POST\b/);
  assert.match(src, /export const dynamic\s*=\s*"force-dynamic"/);
  assert.match(src, /export const runtime\s*=\s*"nodejs"/);
});

test("8.F.3: endpoint validates inputs via Zod and accepts both naming conventions", () => {
  const src = read("src/app/api/onboarding/start/route.ts");
  // Zod schema present.
  assert.match(src, /import\s+\{\s*z\s*\}\s*from\s*"zod"/);
  // Accepts camelCase (matches existing /sign-up form fields).
  assert.match(src, /orgName/);
  assert.match(src, /orgSlug/);
  assert.match(src, /planCode/);
  // Plus snake_case (canonical for HTTP APIs).
  assert.match(src, /org_name/);
  assert.match(src, /org_slug/);
  assert.match(src, /plan_code/);
});

test("8.F.3: endpoint short-circuits on duplicate slug + duplicate email", () => {
  const src = read("src/app/api/onboarding/start/route.ts");
  // Slug uniqueness check before mutation.
  assert.match(src, /organizationCode.*orgCode|orgCode.*organizationCode/s);
  assert.match(src, /already taken|in use/i);
  // Duplicate email response from Supabase Admin → 409.
  assert.match(src, /already registered/i);
});

test("8.F.3: endpoint rolls back the auth user on downstream failure", () => {
  const src = read("src/app/api/onboarding/start/route.ts");
  assert.match(src, /admin\.auth\.admin\.deleteUser\(authUserId\)/);
  assert.match(src, /rollbackAuth/);
});

test("8.F.3: endpoint calls provision_app_user() (single source of truth)", () => {
  const src = read("src/app/api/onboarding/start/route.ts");
  assert.match(src, /provision_app_user\(/);
  // Both grants (super_admin + admin) flow through the same function.
  assert.match(src, /'super_admin'/);
  assert.match(src, /'admin'/);
});

test("8.F.3: endpoint redirects browser form submits to /login with onboarded=1", () => {
  const src = read("src/app/api/onboarding/start/route.ts");
  assert.match(src, /\/login/);
  assert.match(src, /onboarded.*1|"onboarded",\s*"1"/);
  // 303 See Other so the follow-up GET is safe.
  assert.match(src, /303/);
});

test("8.F.3: endpoint logs org_created + user_provisioned audit events", () => {
  const src = read("src/app/api/onboarding/start/route.ts");
  assert.match(src, /\.insert\(auditEvents\)/);
  assert.match(src, /"org\.create"/);
  assert.match(src, /"auth\.user\.provisioned"/);
});

// ===========================================================================
// 8.F.4 — sign-up form wires correctly
// ===========================================================================

test("8.F.4: /sign-up form posts to /api/onboarding/start", () => {
  const src = read("src/app/(auth)/sign-up/page.tsx");
  assert.match(src, /action="\/api\/onboarding\/start"/);
  assert.match(src, /method="POST"/);
});

test("8.F.4: /sign-up form has fields aligned with endpoint schema", () => {
  const src = read("src/app/(auth)/sign-up/page.tsx");
  // 6 fields: email, password, fullName, orgName, orgSlug, planCode.
  for (const name of ["email", "password", "fullName", "orgName", "orgSlug", "planCode"]) {
    assert.match(src, new RegExp(`name="${name}"`), `form must have field "${name}"`);
  }
});

// ===========================================================================
// 8.F closure
// ===========================================================================

test("Phase 8.F: invariant test file is shipped", () => {
  // The DB-bound invariants live in tests/invariants/provisioning.test.ts —
  // they're gated on DATABASE_URL and skipped in static-only CI runs.
  assert.ok(exists("tests/invariants/provisioning.test.ts"));
});
