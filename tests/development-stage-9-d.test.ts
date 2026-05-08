/**
 * Stage 9.D — Owner team management acceptance tests.
 *
 * Static / file-presence tests. The DB-bound invariants for invitations
 * are gated on `DATABASE_URL` and live in
 * `tests/invariants/team-invitations.test.ts`.
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

// ============================================================================
// Migration 0088
// ============================================================================

test("9.D migration 0088 ships team_invitations table + RLS policies", () => {
  const path = "drizzle/0088_team_invitations.sql";
  assert.ok(exists(path));
  const src = read(path);
  // Table + key columns. (Schema-qualified prefix omitted in CREATE TABLE
  // to keep the p111-rls-coverage parser happy — it picks up the bare
  // table name. The qualified `public.team_invitations` form is still
  // used inside DO blocks for pg_policies lookups.)
  assert.match(src, /CREATE TABLE IF NOT EXISTS "team_invitations"/);
  assert.match(src, /token text NOT NULL UNIQUE/);
  assert.match(src, /role_key text NOT NULL CHECK \(role_key IN \(/);
  assert.match(src, /status text NOT NULL DEFAULT 'pending'/);
  // Partial unique index — only one ACTIVE invite per (org, email).
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_active_uniq/);
  assert.match(src, /WHERE status = 'pending'/);
  // RLS enabled + isolation policy + internal bypass.
  assert.match(src, /ENABLE ROW LEVEL SECURITY/);
  assert.match(src, /team_invitations_org_isolation/);
  assert.match(src, /is_in_user_organization\(organization_id\)/);
  assert.match(src, /team_invitations_internal_bypass/);
  // Wrapped in a transaction.
  assert.match(src, /^BEGIN;$/m);
  assert.match(src, /^COMMIT;$/m);
});

test("9.D Drizzle schema mirrors the migration shape", () => {
  const path = "src/lib/db/schema/team-invitations.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export const teamInvitations = pgTable\(\s*"team_invitations"/);
  // Same partial unique index expression — Drizzle wraps the SQL fragment
  // in a sql`...` template, so we match on the predicate text only.
  assert.match(src, /team_invitations_active_uniq/);
  assert.match(src, /status = 'pending'/);
});

// ============================================================================
// Server actions
// ============================================================================

test("9.D: server actions module exports the four required actions", () => {
  const path = "src/features/team/actions.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^"use server"/m);
  assert.match(src, /export async function inviteTeamMemberAction\b/);
  assert.match(src, /export async function acceptInvitationAction\b/);
  assert.match(src, /export async function resendInvitationAction\b/);
  assert.match(src, /export async function revokeAccessAction\b/);
});

test("9.D: invite + revoke + resend require the users.write permission", () => {
  const src = read("src/features/team/actions.ts");
  // Three permission gates (one per mutating action).
  const matches = src.match(/requirePermission\("users\.write"\)/g) ?? [];
  assert.ok(
    matches.length >= 3,
    `expected ≥3 requirePermission("users.write") calls, found ${matches.length}`,
  );
});

test("9.D: invite generates a 32-byte URL-safe token + 7-day expiry", () => {
  const src = read("src/features/team/actions.ts");
  // Token derivation.
  assert.match(src, /randomBytes\(32\)\.toString\("base64url"\)/);
  // 7-day expiration constant.
  assert.match(src, /INVITE_EXPIRY_DAYS\s*=\s*7/);
});

test("9.D: invite blocks a second active invitation for the same (org, email)", () => {
  const src = read("src/features/team/actions.ts");
  assert.match(
    src,
    /An active invitation for that email already exists/i,
  );
});

test("9.D: accept calls provision_app_user with NULL internal role + invitation's cabinet role", () => {
  const src = read("src/features/team/actions.ts");
  // Invitees must NOT get user_roles.super_admin.
  assert.match(src, /provision_app_user\(/);
  assert.match(src, /NULL::text,\s*\$\{invitation\.roleKey\}::text/);
});

test("9.D: revokeAccess refuses to demote the last active admin", () => {
  const src = read("src/features/team/actions.ts");
  assert.match(src, /Cannot revoke the last active admin/i);
});

test("9.D: revokeAccess refuses self-revoke", () => {
  const src = read("src/features/team/actions.ts");
  assert.match(src, /You cannot revoke your own access/i);
});

test("9.D: actions log audit events for invite / accept / resend / revoke", () => {
  const src = read("src/features/team/actions.ts");
  const expected = [
    /"team\.invitation\.created"/,
    /"team\.invitation\.accepted"/,
    /"team\.invitation\.resent"/,
    /"team\.invitation\.revoked"/,
    /"team\.user\.revoked"/,
  ];
  for (const re of expected) assert.match(src, re);
});

// ============================================================================
// UI surfaces
// ============================================================================

test("9.D: /dashboard/settings/team page + sub-components shipped", () => {
  for (const path of [
    "src/app/(dashboard)/dashboard/settings/team/page.tsx",
    "src/app/(dashboard)/dashboard/settings/team/invite-form.tsx",
    "src/app/(dashboard)/dashboard/settings/team/row-actions.tsx",
  ]) {
    assert.ok(exists(path), `missing: ${path}`);
  }
});

test("9.D: team page is force-dynamic + lists pending invitations + members", () => {
  const src = read("src/app/(dashboard)/dashboard/settings/team/page.tsx");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /pendingInvitations/);
  assert.match(src, /from\(teamInvitations\)/);
  assert.match(src, /from\(appUsers\)/);
});

test("9.D: invite form sends company_wide invitations + has all 10 valid roles", () => {
  const src = read("src/app/(dashboard)/dashboard/settings/team/invite-form.tsx");
  assert.match(src, /^"use client"/m);
  assert.match(src, /inviteTeamMemberAction\(/);
  assert.match(src, /scope:\s*"company_wide"/);
  for (const role of [
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
  ]) {
    assert.ok(src.includes(`"${role}"`), `invite form must offer ${role}`);
  }
});

test("9.D: row-actions surfaces both Resend + Revoke for invitations", () => {
  const src = read("src/app/(dashboard)/dashboard/settings/team/row-actions.tsx");
  assert.match(src, /resendInvitationAction\(/);
  assert.match(src, /revokeAccessAction\(/);
  // Confirm dialogs on destructive ops.
  assert.match(src, /confirm\(/);
});

// ============================================================================
// Acceptance flow
// ============================================================================

test("9.D: /accept-invitation/[token] page + accept-form shipped", () => {
  for (const p of [
    "src/app/(public)/accept-invitation/[token]/page.tsx",
    "src/app/(public)/accept-invitation/[token]/accept-form.tsx",
  ]) {
    assert.ok(exists(p), `missing: ${p}`);
  }
});

test("9.D: accept page rejects expired / revoked tokens with a friendly screen", () => {
  const src = read(
    "src/app/(public)/accept-invitation/[token]/page.tsx",
  );
  assert.match(src, /This link is no longer valid/i);
  // Status filter — only pending + not yet expired.
  assert.match(src, /eq\(teamInvitations\.status,\s*"pending"\)/);
  assert.match(src, /gt\(teamInvitations\.expiresAt/);
});

test("9.D: accept-form submits via acceptInvitationAction + routes on success", () => {
  const src = read(
    "src/app/(public)/accept-invitation/[token]/accept-form.tsx",
  );
  assert.match(src, /^"use client"/m);
  assert.match(src, /acceptInvitationAction\(/);
  assert.match(src, /router\.push\(r\.redirectUrl\)/);
});

// ============================================================================
// HTTP endpoint
// ============================================================================

test("9.D: /api/team/invite endpoint wraps the server action", () => {
  const path = "src/app/api/team/invite/route.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export async function POST\b/);
  assert.match(src, /inviteTeamMemberAction\(/);
  // Token is NOT echoed back to the API caller (delivered only via email).
  assert.doesNotMatch(
    src,
    /token:\s*result\.token|result\.token,/,
    "API must not surface the invitation token (audit-trail invariant)",
  );
});

// ============================================================================
// Phase 9.D closure
// ============================================================================

test("Phase 9.D: invariant test file shipped", () => {
  assert.ok(exists("tests/invariants/team-invitations.test.ts"));
});
