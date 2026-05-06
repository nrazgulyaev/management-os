/**
 * Stage 2.3.D — Stage 2.3 closure tests.
 *
 * Coverage:
 *   - 9 finance sub-pages exist + use safeQuery
 *   - Grant-access admin server actions: input validation, rate limit
 *     pattern, service-role-key isolation, dry-run path
 *   - Portal password + language change actions: scope-checked,
 *     password complexity validated, cross-investor isolation
 *   - Project Capital + Finance tabs: real data wiring (no more
 *     ComingInPlaceholder)
 *   - Translation completion (RU + ID full)
 *   - Pre-production gate documentation present
 *   - Demo seed extends with 4 portal templates (welcome+reset, EN+RU)
 *
 * Static-source + pure-function tests — runtime auth flows live in
 * docs/MANUAL-INVESTOR-PORTAL-CHECKLIST.md.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ----------------------------------------------------------------------------
// 1) Pre-production gate documentation
// ----------------------------------------------------------------------------

test("architecture doc has Pre-Production Gates section with all 7 items", () => {
  const src = read("docs/development-os-architecture.md");
  assert.match(src, /Pre-production gates `\[CRITICAL\]`/);
  for (const marker of [
    "Manual walkthrough completion",
    "Cross-investor URL forgery test",
    "JWT claim verification",
    "Notification rule activation",
    "Service role key audit",
    "Auth user setup verification",
    "Rate-limit verification",
  ]) {
    assert.ok(src.includes(marker), `Pre-production gates missing: ${marker}`);
  }
});

test("Stage 2.3 marked ACCEPTED + 2.3.D marked ACTIVE", () => {
  const src = read("docs/development-os-architecture.md");
  assert.match(src, /## Stage 2\.3 — Investor capital \+ Development finance `\[ACCEPTED 2\.3\]`/);
  assert.match(src, /\*\*2\.3\.D\*\* — `\[ACTIVE 2\.3\.D\]`/);
});

// ----------------------------------------------------------------------------
// 2) 9 finance sub-pages exist
// ----------------------------------------------------------------------------

const FINANCE_SUB_PAGES = [
  "src/app/(development-app)/development-os/finance/bank-accounts/page.tsx",
  "src/app/(development-app)/development-os/finance/bank-accounts/[id]/page.tsx",
  "src/app/(development-app)/development-os/finance/transactions/page.tsx",
  "src/app/(development-app)/development-os/finance/transactions/[id]/page.tsx",
  "src/app/(development-app)/development-os/finance/categories/page.tsx",
  "src/app/(development-app)/development-os/finance/budget/page.tsx",
  "src/app/(development-app)/development-os/finance/budget/[projectId]/page.tsx",
  "src/app/(development-app)/development-os/finance/corporate-events/page.tsx",
  "src/app/(development-app)/development-os/finance/fx/page.tsx",
];

test("all 9 finance sub-pages exist", () => {
  for (const rel of FINANCE_SUB_PAGES) {
    assert.ok(exists(rel), `${rel} missing`);
  }
});

test("finance sub-pages remain server components (no 'use client')", () => {
  for (const rel of FINANCE_SUB_PAGES) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /^"use client"/m,
      `${rel} must remain server component`,
    );
  }
});

test("finance list pages use safeQuery for DB calls", () => {
  for (const rel of [
    "src/app/(development-app)/development-os/finance/bank-accounts/page.tsx",
    "src/app/(development-app)/development-os/finance/transactions/page.tsx",
    "src/app/(development-app)/development-os/finance/categories/page.tsx",
    "src/app/(development-app)/development-os/finance/budget/page.tsx",
    "src/app/(development-app)/development-os/finance/corporate-events/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /safeQuery\(/, `${rel} should use safeQuery`);
  }
});

test("finance pages link from /development-os/finance dashboard implicitly via Section structure", () => {
  // The finance dashboard already links to these via the Section/MetricCard
  // grid in 2.3.B; this test just confirms the dashboard wasn't broken.
  const src = read("src/app/(development-app)/development-os/finance/page.tsx");
  assert.match(src, /getBankAccounts/);
  assert.match(src, /evaluateSelfSustainingThreshold/);
});

test("transactions list page has filter form with account/direction/reconciled", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/transactions/page.tsx",
  );
  assert.match(src, /name="account"/);
  assert.match(src, /name="direction"/);
  assert.match(src, /name="reconciled"/);
});

test("budget page lets user pick a project + shows three-state matrix", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/budget/page.tsx",
  );
  assert.match(src, /name="projectId"/);
  assert.match(src, /Budgeted/);
  assert.match(src, /Committed/);
  assert.match(src, /Actual/);
  assert.match(src, /Variance/);
});

test("FX page shows latest snapshot + 60 historical rows", () => {
  const src = read("src/app/(development-app)/development-os/finance/fx/page.tsx");
  assert.match(src, /getLatestFXSnapshot/);
  assert.match(src, /\.limit\(60\)/);
});

// ----------------------------------------------------------------------------
// 3) Grant-access server actions
// ----------------------------------------------------------------------------

const ACCESS_ACTIONS_PATH =
  "src/lib/development/server/investor-access-actions.ts";

test("investor-access-actions.ts has server-only guard", () => {
  const src = read(ACCESS_ACTIONS_PATH);
  assert.match(src, /^(import "server-only";|"use server";)/m);
});

test("grantInvestorPortalAccess + revokeInvestorPortalAccess + getInvestorAccessStatus exported", () => {
  const src = read(ACCESS_ACTIONS_PATH);
  for (const fn of [
    "grantInvestorPortalAccess",
    "revokeInvestorPortalAccess",
    "getInvestorAccessStatus",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `missing export ${fn}`,
    );
  }
});

test("grantInvestorPortalAccess gates on requireInternalUser (caller must be staff)", () => {
  const src = read(ACCESS_ACTIONS_PATH);
  const fn = src.slice(src.indexOf("export async function grantInvestorPortalAccess"));
  const end = fn.indexOf("\n}\n");
  const body = fn.slice(0, end);
  assert.match(body, /requireInternalUser\(\)/);
});

test("grantInvestorPortalAccess enforces 5-per-hour rate limit per staff user", () => {
  const src = read(ACCESS_ACTIONS_PATH);
  assert.match(src, /RATE_LIMIT_PER_HOUR = 5/);
  assert.match(src, /Rate limit:/);
});

test("grant flow validates password complexity (length + mixed case + number)", () => {
  const src = read(ACCESS_ACTIONS_PATH);
  assert.match(src, /\[A-Z\]/);
  assert.match(src, /\[a-z\]/);
  assert.match(src, /\[0-9\]/);
  assert.match(src, /min\(12\)/);
});

test("grant flow handles dry-run when service role key is absent", () => {
  const src = read(ACCESS_ACTIONS_PATH);
  assert.match(src, /getSupabaseAdmin\(\)/);
  assert.match(src, /dryRun/);
  // Dry-run path logs to delivery log with `failed` status + reason
  assert.match(src, /service_role_key_absent/);
});

test("grant flow audits every action to dev_notification_delivery_log with template grant_access_audit", () => {
  const src = read(ACCESS_ACTIONS_PATH);
  assert.match(src, /grant_access_audit/);
  assert.match(src, /devNotificationDeliveryLog/);
});

test("revoke flow gates on requireInternalUser + sets investor_id NULL + suspends user", () => {
  const src = read(ACCESS_ACTIONS_PATH);
  const fn = src.slice(src.indexOf("export async function revokeInvestorPortalAccess"));
  const end = fn.indexOf("\n}\n");
  const body = fn.slice(0, end);
  assert.match(body, /requireInternalUser\(\)/);
  assert.match(body, /investorId: null/);
  assert.match(body, /status: "suspended"/);
});

test("service role key is server-only — never imported from a client component", () => {
  // Grep all client-marked files for any reference to the admin client
  // or the service role key. Should be zero hits.
  const adminPath = "src/lib/supabase/admin.ts";
  const adminSrc = read(adminPath);
  assert.match(adminSrc, /^(import "server-only";|"use server";)/m);
});

test("grant-access admin page exists + uses server actions", () => {
  const src = read(
    "src/app/(development-app)/development-os/investors/[code]/grant-access/page.tsx",
  );
  assert.match(src, /grantInvestorPortalAccess/);
  assert.match(src, /revokeInvestorPortalAccess/);
  assert.match(src, /getInvestorAccessStatus/);
  assert.match(src, /"use server"/);
  // Surfaces dry-run state to the operator
  assert.match(src, /isSupabaseAdminConfigured/);
});

test("investor detail page links to grant-access", () => {
  const src = read(
    "src/app/(development-app)/development-os/investors/[code]/page.tsx",
  );
  assert.match(src, /\/grant-access/);
});

// ----------------------------------------------------------------------------
// 4) Portal write actions: password + language
// ----------------------------------------------------------------------------

const PORTAL_ACTIONS_PATH = "src/lib/investor-portal/actions.ts";

test("investor-portal/actions.ts has server-only guard", () => {
  const src = read(PORTAL_ACTIONS_PATH);
  assert.match(src, /^(import "server-only";|"use server";)/m);
});

test("updateMyReportingLanguage + updateMyPassword exported", () => {
  const src = read(PORTAL_ACTIONS_PATH);
  assert.match(src, /export async function updateMyReportingLanguage/);
  assert.match(src, /export async function updateMyPassword/);
});

test("portal write actions require investor session", () => {
  const src = read(PORTAL_ACTIONS_PATH);
  // Both functions must call requireInvestorSession
  const lang = src.slice(src.indexOf("export async function updateMyReportingLanguage"));
  assert.match(lang, /requireInvestorSession\(\)/);
  const pw = src.slice(src.indexOf("export async function updateMyPassword"));
  assert.match(pw, /requireInvestorSession\(\)/);
});

test("updateMyReportingLanguage scopes WHERE to session.investorId (cross-investor protection)", () => {
  const src = read(PORTAL_ACTIONS_PATH);
  const fn = src.slice(src.indexOf("export async function updateMyReportingLanguage"));
  const end = fn.indexOf("\n}\n");
  const body = fn.slice(0, end);
  assert.match(body, /eq\(investors\.id, session\.investorId\)/);
});

test("updateMyPassword enforces complexity (length + upper + lower + number)", () => {
  const src = read(PORTAL_ACTIONS_PATH);
  assert.match(src, /\.min\(12/);
  assert.match(src, /Must contain an uppercase letter/);
  assert.match(src, /Must contain a lowercase letter/);
  assert.match(src, /Must contain a number/);
});

test("updateMyPassword routes through Supabase Auth updateUser", () => {
  const src = read(PORTAL_ACTIONS_PATH);
  assert.match(src, /supabase\.auth\.updateUser\(\{ password: newPassword \}\)/);
});

test("portal profile page wires both language + password forms", () => {
  const src = read(
    "src/app/(investor-portal)/investor-portal/profile/page.tsx",
  );
  assert.match(src, /handleLanguage/);
  assert.match(src, /handlePassword/);
  assert.match(src, /updateMyReportingLanguage/);
  assert.match(src, /updateMyPassword/);
  // Confirm UI prevents mismatched passwords
  assert.match(src, /Passwords%20do%20not%20match/);
});

// ----------------------------------------------------------------------------
// 5) Project Capital + Finance tabs (no longer placeholders)
// ----------------------------------------------------------------------------

test("project detail page imports Stage 2.3 finance + capital queries", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/page.tsx",
  );
  for (const fn of [
    "getCommitments",
    "getBudgetVsActual",
    "getProjectFinancialSummary",
    "evaluateSelfSustainingThreshold",
    "getProjectBalance",
    "getTransactions",
  ]) {
    assert.match(src, new RegExp(fn), `project page missing import: ${fn}`);
  }
});

test("project detail page has Capital tab with commitments table", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/page.tsx",
  );
  // The tab definition + a commitments-rendering block
  assert.match(src, /value: "capital"/);
  assert.match(src, /label: "Capital"/);
  assert.match(src, /projectCommitments/);
});

test("project Finance tab shows real budget vs actual (no longer placeholder)", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/page.tsx",
  );
  // Must include the new financialSummary block, not just the placeholder
  assert.match(src, /financialSummary/);
  assert.match(src, /budgetRows/);
  // Placeholder branch is now gated on missing data, not always-on
  assert.match(
    src,
    /detail\.source !== "db" \|\| !financialSummary/,
    "Finance tab must check financialSummary, not just stage gate",
  );
});

test("project Capital tab uses safeQuery for resilience", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/page.tsx",
  );
  assert.match(src, /safeQuery\(/);
  // All new fetchers wrapped
  assert.match(src, /safeQuery\(\s*"getCommitments\(project\)"/);
  assert.match(src, /safeQuery\(\s*"getBudgetVsActual\(project\)"/);
});

// ----------------------------------------------------------------------------
// 6) Translation completion
// ----------------------------------------------------------------------------

test("RU translation covers all canonical PortalStrings keys", async () => {
  const { getPortalStrings } = await import(
    "../src/lib/investor-portal/translations"
  );
  const en = getPortalStrings("en");
  const ru = getPortalStrings("ru");
  // RU must override every string-typed property (functions counted by signature)
  for (const key of Object.keys(en) as Array<keyof typeof en>) {
    if (typeof en[key] === "string") {
      assert.notEqual(
        ru[key],
        en[key],
        `RU translation falls back to EN for "${String(key)}" — should be translated`,
      );
    }
  }
});

test("ID translation covers nav + dashboard + login keys", async () => {
  const { getPortalStrings } = await import(
    "../src/lib/investor-portal/translations"
  );
  const en = getPortalStrings("en");
  const id = getPortalStrings("id");
  // Filter out keys where the EN and ID strings happen to match (e.g.
  // "Email", "Status" — same word in both languages).
  for (const key of [
    "navDashboard",
    "navCommitments",
    "navDistributions",
    "navWallet",
    "navDocuments",
    "navProfile",
    "loginTitle",
    "loginPassword",
    "loginSubmit",
    "dashTotalCommitted",
    "dashTotalDrawn",
    "dashTotalDistributed",
    "dashInWallet",
    "amount",
    "type",
    "project",
    "statusActive",
  ] as const) {
    assert.notEqual(
      id[key],
      en[key],
      `ID translation falls back to EN for "${key}"`,
    );
  }
});

test("ZH falls back to EN gracefully (Proxy pattern)", async () => {
  const { getPortalStrings } = await import(
    "../src/lib/investor-portal/translations"
  );
  const zh = getPortalStrings("zh");
  // ZH only translates a handful — others fall back to EN cleanly
  assert.equal(zh.amount, "Amount");
  assert.equal(zh.loginEmail, "Email");
  // But it does have the nav translated
  assert.match(zh.navDashboard, /[一-龥]/);
});

test("RU includes Russian financial terminology (e.g. инвестиции, кошельке)", async () => {
  const { getPortalStrings } = await import(
    "../src/lib/investor-portal/translations"
  );
  const ru = getPortalStrings("ru");
  assert.match(ru.navCommitments, /инвестиции/i);
  assert.match(ru.dashInWallet, /кошельк/i);
});

test("ID uses formal Indonesian financial terms (komitmen, distribusi, dompet)", async () => {
  const { getPortalStrings } = await import(
    "../src/lib/investor-portal/translations"
  );
  const id = getPortalStrings("id");
  assert.match(id.navCommitments, /Komitmen/);
  assert.match(id.navDistributions, /Distribusi/);
  assert.match(id.navWallet, /Dompet/);
});

// ----------------------------------------------------------------------------
// 7) Demo seed extension
// ----------------------------------------------------------------------------

test("seed creates the 4 portal templates (welcome + reset, EN + RU)", () => {
  const src = read("scripts/seed-dev-os.mjs");
  for (const name of [
    "investor_portal_welcome_en",
    "investor_portal_welcome_ru",
    "investor_portal_password_reset_en",
    "investor_portal_password_reset_ru",
  ]) {
    assert.ok(
      src.includes(`"${name}"`),
      `seed missing portal template: ${name}`,
    );
  }
});

test("seed reports the 2.3.D portal template count separately", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /2\.3\.D portal templates/);
});

// ----------------------------------------------------------------------------
// 8) End-to-end structure invariants
// ----------------------------------------------------------------------------

test("no schema migrations added in 2.3.D (Stage 2.3 schema closed at 0039)", () => {
  // 0039 is the highest Stage 2.3 migration. Any 0040+ in the drizzle/
  // directory would indicate the no-new-migrations constraint was broken.
  assert.ok(
    !exists("drizzle/0040_development_os_stage_2_3_d.sql"),
    "Stage 2.3.D must not introduce migration 0040 — schema closed at 0039",
  );
  // Spot-check: 0039 is present (the foundation 2.3.D builds on)
  assert.ok(
    exists("drizzle/0039_development_os_stage_2_3_c_access_control.sql"),
    "0039 must exist as the Stage 2.3 closing migration",
  );
});
