/**
 * Stage 2.3.C — investor portal structure, multi-language scaffolding,
 * notification rules + templates seed, demo investor user mapping.
 *
 * Companion to development-stage-2-3-c-access-control.test.ts which
 * holds the security-load-bearing tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ----------------------------------------------------------------------------
// 1) Portal route structure
// ----------------------------------------------------------------------------

const PORTAL_ROUTES = [
  "src/app/(investor-portal)/layout.tsx",
  "src/app/(investor-portal)/investor-portal/page.tsx",
  "src/app/(investor-portal)/investor-portal/login/page.tsx",
  "src/app/(investor-portal)/investor-portal/dashboard/page.tsx",
  "src/app/(investor-portal)/investor-portal/commitments/page.tsx",
  "src/app/(investor-portal)/investor-portal/commitments/[id]/page.tsx",
  "src/app/(investor-portal)/investor-portal/distributions/page.tsx",
  "src/app/(investor-portal)/investor-portal/distributions/[id]/page.tsx",
  "src/app/(investor-portal)/investor-portal/wallet/[commitmentId]/page.tsx",
  "src/app/(investor-portal)/investor-portal/documents/page.tsx",
  "src/app/(investor-portal)/investor-portal/profile/page.tsx",
];

test("all 11 investor portal routes exist", () => {
  for (const rel of PORTAL_ROUTES) {
    assert.ok(exists(rel), `${rel} missing`);
  }
});

test("portal pages all redirect to login when no investor session", () => {
  // Each authenticated route must call getInvestorSession() and redirect on null
  for (const rel of [
    "src/app/(investor-portal)/investor-portal/dashboard/page.tsx",
    "src/app/(investor-portal)/investor-portal/commitments/page.tsx",
    "src/app/(investor-portal)/investor-portal/commitments/[id]/page.tsx",
    "src/app/(investor-portal)/investor-portal/distributions/page.tsx",
    "src/app/(investor-portal)/investor-portal/distributions/[id]/page.tsx",
    "src/app/(investor-portal)/investor-portal/wallet/[commitmentId]/page.tsx",
    "src/app/(investor-portal)/investor-portal/documents/page.tsx",
    "src/app/(investor-portal)/investor-portal/profile/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /getInvestorSession\(\)/, `${rel} must call getInvestorSession`);
    assert.match(
      src,
      /redirect\("\/investor-portal\/login"\)/,
      `${rel} must redirect on null session`,
    );
  }
});

test("root /investor-portal redirects to /investor-portal/dashboard", () => {
  const src = read("src/app/(investor-portal)/investor-portal/page.tsx");
  assert.match(src, /redirect\("\/investor-portal\/dashboard"\)/);
});

test("login page handles authenticated-but-not-investor case", () => {
  const src = read("src/app/(investor-portal)/investor-portal/login/page.tsx");
  // Three branches: valid investor (redirect), authenticated non-investor
  // (gating message), unauthenticated (login link)
  assert.match(src, /redirect\("\/investor-portal\/dashboard"\)/);
  assert.match(src, /getCurrentAuthUser/);
  assert.match(src, /notInvestor/);
});

test("portal pages do NOT use 'use client' directive (server components only)", () => {
  for (const rel of PORTAL_ROUTES) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /^"use client"/m,
      `${rel} must remain a server component`,
    );
  }
});

// ----------------------------------------------------------------------------
// 2) Portal shell + visual distinction from /development-os
// ----------------------------------------------------------------------------

test("portal layout uses cream background (#F8F5F0) for context shift", () => {
  const src = read("src/app/(investor-portal)/layout.tsx");
  assert.match(src, /bg-\[#F8F5F0\]/);
});

test("PortalShell component exists + provides nav", () => {
  const src = read("src/components/investor-portal/portal-shell.tsx");
  assert.match(src, /export function PortalShell/);
  for (const item of ["navDashboard", "navCommitments", "navDistributions", "navDocuments", "navProfile"]) {
    assert.match(src, new RegExp(`strings\\.${item}`), `nav missing ${item}`);
  }
});

// ----------------------------------------------------------------------------
// 3) Multi-language translations
// ----------------------------------------------------------------------------

test("translations module exists with EN/RU/ID/ZH dictionaries", async () => {
  const { getPortalStrings } = await import(
    "../src/lib/investor-portal/translations"
  );
  for (const lang of ["en", "ru", "id", "zh"] as const) {
    const t = getPortalStrings(lang);
    assert.ok(t.appTitle, `${lang}: appTitle missing`);
    assert.ok(t.navDashboard, `${lang}: navDashboard missing`);
    assert.ok(t.navCommitments, `${lang}: navCommitments missing`);
  }
});

test("translations fall back to EN when a key isn't translated", async () => {
  const { getPortalStrings } = await import(
    "../src/lib/investor-portal/translations"
  );
  // ZH only translates ~6 keys — anything else falls back to EN
  const zh = getPortalStrings("zh");
  assert.equal(zh.loginEmail, "Email");
  assert.equal(zh.amount, "Amount");
});

test("RU translations cover the key dashboard headings", async () => {
  const { getPortalStrings } = await import(
    "../src/lib/investor-portal/translations"
  );
  const ru = getPortalStrings("ru");
  assert.match(ru.appTitle, /[А-Яа-я]/);
  assert.match(ru.dashTotalCommitted, /[А-Яа-я]/);
});

// ----------------------------------------------------------------------------
// 4) Session helpers — code-level scope verification
// ----------------------------------------------------------------------------

test("InvestorSession type exported from session.ts", () => {
  const src = read("src/lib/investor-portal/session.ts");
  assert.match(src, /export interface InvestorSession/);
  assert.match(src, /investorId: string/);
  assert.match(src, /reportingLanguage: ReportingLanguage/);
});

test("session.ts joins through user_roles ↔ roles (matches schema reality)", () => {
  const src = read("src/lib/investor-portal/session.ts");
  assert.match(src, /innerJoin\(userRoles/);
  assert.match(src, /innerJoin\(roles/);
});

// ----------------------------------------------------------------------------
// 5) Notification templates + rules seed
// ----------------------------------------------------------------------------

test("seed creates all 5 2.3.B event notification templates", () => {
  const src = read("scripts/seed-dev-os.mjs");
  for (const name of [
    "drawdown_overdue_en",
    "bank_balance_below_threshold_en",
    "project_self_sustaining_reached_en",
    "project_self_sustaining_lost_en",
    "bank_balance_discrepancy_en",
  ]) {
    assert.ok(
      src.includes(`"${name}"`),
      `seed missing template: ${name}`,
    );
  }
});

test("seed creates 5 active notification rules for 2.3.B events", () => {
  const src = read("scripts/seed-dev-os.mjs");
  for (const event of [
    "drawdown_overdue",
    "bank_balance_below_threshold",
    "project_self_sustaining_reached",
    "project_self_sustaining_lost",
    "bank_balance_discrepancy",
  ]) {
    // Each event appears as a rule with the corresponding trigger
    assert.match(
      src,
      new RegExp(`event:\\s*"${event}"`),
      `seed missing rule for event: ${event}`,
    );
  }
});

test("seed uses 'specific_role' recipient_type (matches schema check)", () => {
  const src = read("scripts/seed-dev-os.mjs");
  // `'role'` is rejected by the existing CHECK constraint
  assert.match(src, /recipientType: "specific_role"/);
});

// ----------------------------------------------------------------------------
// 6) Portal demo seed
// ----------------------------------------------------------------------------

test("seed maps 2 demo investors to portal access", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /andrey\.demo@example\.com/);
  assert.match(src, /singapore\.demo@example\.com/);
  assert.match(src, /investor_viewer/);
});

test("seed documents the manual Supabase auth user creation step", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /next step: create Supabase auth users/);
});

test("seed uses ON CONFLICT (email) DO UPDATE for portal user mapping (idempotent)", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(
    src,
    /INSERT INTO app_users \(email, full_name, status, investor_id\)[\s\S]+?ON CONFLICT \(email\) DO UPDATE/,
  );
});

// ----------------------------------------------------------------------------
// 7) Drizzle schema reflects the new column
// ----------------------------------------------------------------------------

test("Drizzle appUsers schema has investorId column", () => {
  const src = read("src/lib/db/schema/identity.ts");
  assert.match(src, /investorId: uuid\("investor_id"\)/);
  assert.match(src, /index\("app_users_investor_idx"\)/);
});

// ----------------------------------------------------------------------------
// 8) Withdrawal/reinvest deferred but visible in UI
// ----------------------------------------------------------------------------

test("wallet page shows disabled withdrawal/reinvest CTAs", () => {
  const src = read(
    "src/app/(investor-portal)/investor-portal/wallet/[commitmentId]/page.tsx",
  );
  assert.match(src, /requestWithdrawal/);
  assert.match(src, /requestReinvest/);
  assert.match(src, /notYetEnabled/);
  assert.match(src, /disabled/);
});
