/**
 * Stage 10.M.2 — /dashboard/settings/account-security acceptance tests.
 *
 * Closes the audit's BUILD #2: a per-user security center with
 *   - password change (Supabase auth update)
 *   - TOTP MFA enrol / disable (re-uses existing 8.B mfa-buttons)
 *   - "sign out other sessions" using Supabase signOut scope:'others'
 *   - per-user audit log (login attempts + security events)
 *
 * No new schema; reuses Stage 8.B tables (auth_login_attempts,
 * auth_security_events, auth_mfa_factors, auth_mfa_recovery_codes).
 *
 * Adds 2 new SecurityEventType values: password_changed,
 * sessions_revoked_others (with their severity defaults + labels).
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

const PAGE =
  "src/app/(dashboard)/dashboard/settings/account-security/page.tsx";
const SERVICES = "src/features/auth/account-security-services.ts";
const ACTIONS = "src/features/auth/account-security-actions.ts";
const BUTTONS = "src/components/settings/account-security-buttons.tsx";
const SETTINGS_LANDING = "src/app/(dashboard)/dashboard/settings/page.tsx";
const EVENTS_PURE = "src/features/security-baseline/security-events-pure.ts";
const DECISIONS_DOC = "tmp/stage-10-m-2-decisions.md";

test("10.M.2 — account-security page file exists", () => {
  assert.ok(exists(PAGE), `Missing ${PAGE}`);
});

test("10.M.2 — per-user query helpers exist + scope every query by appUserId", () => {
  assert.ok(exists(SERVICES), `Missing ${SERVICES}`);
  const src = read(SERVICES);
  assert.match(src, /export async function listMyLoginAttempts/);
  assert.match(src, /export async function listMySecurityEvents/);
  assert.match(src, /export async function summarizeMyAccountSecurity/);
  // Every query must filter by appUserId — no global query slipping in.
  const eqAppUser = src.match(/eq\(authLoginAttempts\.appUserId,\s*appUserId\)/g) ?? [];
  assert.ok(
    eqAppUser.length >= 3,
    "listMyLoginAttempts/summarize must filter by appUserId at least 3× across the helpers",
  );
  assert.match(src, /eq\(authSecurityEvents\.appUserId,\s*appUserId\)/);
});

test("10.M.2 — per-user query helpers do NOT call admin-facing list functions", () => {
  const src = read(SERVICES);
  assert.doesNotMatch(
    src,
    /listMfaFactorsForAdmin|listSecurityEventsForAdmin|listRecentLoginAttempts/,
    "self-serve queries must not borrow the admin variants — they're not user-scoped",
  );
});

test("10.M.2 — actions file exposes changePasswordAction + signOutOtherSessionsAction", () => {
  assert.ok(exists(ACTIONS), `Missing ${ACTIONS}`);
  const src = read(ACTIONS);
  assert.match(src, /^"use server"/m, "must be a server action module");
  assert.match(src, /export async function changePasswordAction/);
  assert.match(src, /export async function signOutOtherSessionsAction/);
});

test("10.M.2 — actions guard on getCurrentAppUser before mutating", () => {
  const src = read(ACTIONS);
  // Both actions must call getCurrentAppUser and bail when null.
  const guards = src.match(/await getCurrentAppUser\(\)/g) ?? [];
  assert.ok(
    guards.length >= 2,
    "both actions must guard with await getCurrentAppUser()",
  );
  assert.match(
    src,
    /if \(!me\) return \{ ok: false/,
    "must early-return when no signed-in user",
  );
});

test("10.M.2 — sign-out-others uses Supabase signOut scope:'others' (not the global signOut)", () => {
  const src = read(ACTIONS);
  assert.match(
    src,
    /signOut\(\{\s*scope:\s*"others"\s*\}\)/,
    "must scope sign-out to other sessions only",
  );
});

test("10.M.2 — actions record security events for password change + session revoke", () => {
  const src = read(ACTIONS);
  assert.match(src, /eventType:\s*"password_changed"/);
  assert.match(src, /eventType:\s*"sessions_revoked_others"/);
});

test("10.M.2 — security-events-pure adds the 2 new event types + labels + severities", () => {
  const src = read(EVENTS_PURE);
  // Type union members.
  assert.match(src, /\|\s*"password_changed"/);
  assert.match(src, /\|\s*"sessions_revoked_others"/);
  // Severity defaults.
  assert.match(src, /password_changed:\s*"info"/);
  assert.match(src, /sessions_revoked_others:\s*"warning"/);
  // Human-readable labels.
  assert.match(src, /case "password_changed":\s*\n\s*return "Password changed"/);
  assert.match(
    src,
    /case "sessions_revoked_others":\s*\n\s*return "Other sessions signed out"/,
  );
});

test("10.M.2 — page uses 10.D primitives (DashboardKpi + NoItemsYet) + ConfirmDialog via SignOutOtherSessionsButton", () => {
  const pageSrc = read(PAGE);
  assert.match(pageSrc, /DashboardKpi/);
  assert.match(pageSrc, /NoItemsYet/);
  assert.match(
    pageSrc,
    /from "@\/components\/ui\/primitives"/,
    "imports from 10.D barrel",
  );
  // The destructive sign-out button uses 10.D's ConfirmDialog.
  const buttonsSrc = read(BUTTONS);
  assert.match(buttonsSrc, /ConfirmDialog/);
  assert.match(buttonsSrc, /from "@\/components\/ui\/primitives"/);
});

test("10.M.2 — page reuses existing MFA buttons (no new MFA action surface)", () => {
  const pageSrc = read(PAGE);
  assert.match(pageSrc, /DisableMfaButton/);
  assert.match(pageSrc, /StartEnrolmentButton/);
  assert.match(
    pageSrc,
    /from "@\/components\/security\/mfa-buttons"/,
    "must re-use the Stage 8.B / 10.E.7 MFA controls — no fork",
  );
});

test("10.M.2 — page renders 4 KPI cards (MFA, recovery codes, failed-30d, last-success)", () => {
  const src = read(PAGE);
  assert.match(src, /label="MFA"/);
  assert.match(src, /label="Recovery codes"/);
  assert.match(src, /label="Failed logins · 30d"/);
  assert.match(src, /label="Last successful sign-in"/);
});

test("10.M.2 — page bails out gracefully when there's no signed-in user", () => {
  const src = read(PAGE);
  assert.match(src, /if \(!me\)/, "must short-circuit on null user");
  assert.match(
    src,
    /Sign in to manage/i,
    "must display a friendly call-to-action when not authenticated",
  );
});

test("10.M.2 — page hashes IPs (never displays raw)", () => {
  const src = read(PAGE);
  assert.match(
    src,
    /IP fingerprint/i,
    "label must read 'IP fingerprint' (not 'IP address')",
  );
  assert.match(
    src,
    /a\.ipHash\.slice\(0, 12\)/,
    "must show a truncated SHA hash, not the raw IP",
  );
  // The query helper itself only selects the hash column, never raw IP — there
  // is no raw IP column in auth_login_attempts to begin with.
  assert.doesNotMatch(read(SERVICES), /\bipAddress\b/);
});

test("10.M.2 — settings landing surfaces an Account security CTA", () => {
  const src = read(SETTINGS_LANDING);
  assert.match(
    src,
    /href="\/dashboard\/settings\/account-security"/,
    "settings landing must link to the new page",
  );
  assert.match(src, /Account security/);
});

test("10.M.2 — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists(DECISIONS_DOC), `Missing ${DECISIONS_DOC}`);
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 10 \/ PHASE 10\.M\.2 ACCEPTED/);
});
