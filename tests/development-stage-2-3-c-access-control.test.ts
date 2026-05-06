/**
 * Stage 2.3.C — investor portal access control test harness.
 *
 * Two layers of verification:
 *
 *   1. **Static-source verification** (this file) — assert that
 *      migration 0039 contains the expected RLS policies, helper
 *      functions, and trigger guards. If a future change weakens or
 *      removes a policy, these tests fail loudly.
 *
 *   2. **Code-level scope tests** — verify the server query layer
 *      throws on missing investor session (defense in depth on top
 *      of RLS).
 *
 * Runtime RLS verification (real `auth.uid()` switching between
 * Investor A, Investor B, and internal staff) requires a live
 * Supabase Auth context that the test harness cannot synthesize
 * directly. That verification lives in
 * `docs/MANUAL-INVESTOR-PORTAL-CHECKLIST.md` (created in this stage)
 * and is exercised once per deployment by an internal staff member
 * logging in as both demo investor accounts and walking the routes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIGRATION_PATH =
  "drizzle/0039_development_os_stage_2_3_c_access_control.sql";

// ----------------------------------------------------------------------------
// Test 1: migration file exists with the right shape
// ----------------------------------------------------------------------------

test("migration 0039 exists", () => {
  assert.ok(exists(MIGRATION_PATH), "migration 0039 must exist");
});

const SQL = exists(MIGRATION_PATH) ? read(MIGRATION_PATH) : "";

// ----------------------------------------------------------------------------
// Test 2: app_users.investor_id column added
// ----------------------------------------------------------------------------

test("migration 0039 adds investor_id FK to app_users with ON DELETE RESTRICT", () => {
  assert.match(
    SQL,
    /ADD COLUMN "investor_id" uuid REFERENCES "investors"\("id"\) ON DELETE RESTRICT/,
  );
});

test("migration 0039 indexes app_users.investor_id (partial)", () => {
  assert.match(
    SQL,
    /CREATE INDEX IF NOT EXISTS app_users_investor_idx[\s\S]+?WHERE "investor_id" IS NOT NULL/,
  );
});

// ----------------------------------------------------------------------------
// Test 3: helper functions present + STABLE + (deliberately) SECURITY DEFINER
// ----------------------------------------------------------------------------

test("is_investor_user() function is created STABLE", () => {
  assert.match(
    SQL,
    /CREATE OR REPLACE FUNCTION public\.is_investor_user\(\)[\s\S]+?LANGUAGE plpgsql STABLE/,
  );
});

test("current_investor_id() function is created STABLE", () => {
  assert.match(
    SQL,
    /CREATE OR REPLACE FUNCTION public\.current_investor_id\(\)[\s\S]+?LANGUAGE plpgsql STABLE/,
  );
});

test("helper functions check investor_viewer role + active status + non-null investor_id", () => {
  // is_investor_user must require ALL three: role, active, investor_id NOT NULL
  assert.match(SQL, /AND r\.key = 'investor_viewer'/);
  assert.match(SQL, /AND u\.status = 'active'/);
  assert.match(SQL, /AND u\.investor_id IS NOT NULL/);
});

test("helper functions use SECURITY DEFINER (rationale documented in migration header)", () => {
  // Spec proposed INVOKER but DEFINER is required to read app_users
  // inside RLS evaluation without circular dependency. Documented in
  // the migration header.
  assert.match(SQL, /is_investor_user[\s\S]+?SECURITY DEFINER/);
  assert.match(SQL, /current_investor_id[\s\S]+?SECURITY DEFINER/);
});

// ----------------------------------------------------------------------------
// Test 4: RLS SELECT policies for the 8 investor-visible tables
// ----------------------------------------------------------------------------

test("investor SELECT policy exists on `investors` table (self only)", () => {
  assert.match(
    SQL,
    /CREATE POLICY investor_can_read_self ON "investors"[\s\S]+?id = public\.current_investor_id\(\)/,
  );
});

test("investor SELECT policy exists on `capital_commitments` (own only)", () => {
  assert.match(
    SQL,
    /CREATE POLICY investor_can_read_own_commitments ON "capital_commitments"[\s\S]+?investor_id = public\.current_investor_id\(\)/,
  );
});

test("investor SELECT policy exists on `capital_drawdowns` (scoped via own commitments)", () => {
  assert.match(
    SQL,
    /CREATE POLICY investor_can_read_own_drawdowns ON "capital_drawdowns"[\s\S]+?commitment_id IN \([\s\S]+?investor_id = public\.current_investor_id\(\)/,
  );
});

test("investor SELECT policy exists on `investor_wallets` (scoped via own commitments)", () => {
  assert.match(
    SQL,
    /CREATE POLICY investor_can_read_own_wallets ON "investor_wallets"[\s\S]+?commitment_id IN \([\s\S]+?investor_id = public\.current_investor_id\(\)/,
  );
});

test("investor SELECT policy exists on `wallet_transactions` (scoped via own commitments)", () => {
  assert.match(
    SQL,
    /CREATE POLICY investor_can_read_own_wallet_txns ON "wallet_transactions"[\s\S]+?commitment_id IN \([\s\S]+?investor_id = public\.current_investor_id\(\)/,
  );
});

test("investor SELECT policy exists on `distribution_allocations` (only own allocations)", () => {
  assert.match(
    SQL,
    /CREATE POLICY investor_can_read_own_allocations ON "distribution_allocations"[\s\S]+?commitment_id IN \([\s\S]+?investor_id = public\.current_investor_id\(\)/,
  );
});

test("investor SELECT policy exists on `distributions` (scoped to ones with own allocation)", () => {
  // Critical: a distribution is visible only if the investor has at least
  // one allocation in it. Other allocations remain invisible via the
  // distribution_allocations policy above.
  assert.match(
    SQL,
    /CREATE POLICY investor_can_read_own_distributions ON "distributions"[\s\S]+?id IN \([\s\S]+?distribution_allocations[\s\S]+?investor_id = public\.current_investor_id\(\)/,
  );
});

test("investor SELECT policy exists on `documents` (scoped to own agreements + receipts)", () => {
  assert.match(
    SQL,
    /CREATE POLICY investor_can_read_own_documents ON "documents"[\s\S]+?agreement_document_id[\s\S]+?UNION[\s\S]+?receipt_document_id/,
  );
});

// ----------------------------------------------------------------------------
// Test 5: every policy gates on `is_investor_user()` so internal staff and
// anonymous callers don't accidentally hit the policy logic
// ----------------------------------------------------------------------------

test("every investor SELECT policy gates on is_investor_user()", () => {
  for (const policyName of [
    "investor_can_read_self",
    "investor_can_read_own_commitments",
    "investor_can_read_own_drawdowns",
    "investor_can_read_own_wallets",
    "investor_can_read_own_wallet_txns",
    "investor_can_read_own_allocations",
    "investor_can_read_own_distributions",
    "investor_can_read_own_documents",
  ]) {
    const policyBlock = SQL.match(
      new RegExp(`CREATE POLICY ${policyName}[\\s\\S]+?\\)\\s*\\)\\s*;`),
    );
    assert.ok(policyBlock, `policy ${policyName} not found`);
    assert.match(
      policyBlock![0],
      /public\.is_investor_user\(\)/,
      `policy ${policyName} must call is_investor_user()`,
    );
  }
});

// ----------------------------------------------------------------------------
// Test 6: tables NOT in the visible list have NO investor policy
// ----------------------------------------------------------------------------

test("excluded tables have NO investor SELECT policy", () => {
  // Investors must NEVER see internal finance ledger or other-investor data.
  // The migration shouldn't mention these table names in any CREATE POLICY
  // for the investor role.
  for (const excluded of [
    "dev_bank_accounts",
    "dev_transactions",
    "dev_budget_lines",
    "dev_commitments_ledger",
    "dev_corporate_events",
    "dev_fx_snapshots",
    "dev_cost_categories",
    "dev_notification_rules",
    "dev_notification_templates",
    "dev_notification_delivery_log",
    "contacts",
    "contact_roles",
    "contact_interactions",
    "agents",
    "lead_sources",
  ]) {
    const re = new RegExp(`CREATE POLICY[^;]+?ON "${excluded}"[^;]+?is_investor_user`);
    assert.doesNotMatch(
      SQL,
      re,
      `migration must NOT add an investor policy on ${excluded}`,
    );
  }
});

// ----------------------------------------------------------------------------
// Test 7: privilege-escalation guard (trigger blocking investor_id swap)
// ----------------------------------------------------------------------------

test("protect_app_users_investor_id trigger function is created", () => {
  assert.match(
    SQL,
    /CREATE OR REPLACE FUNCTION public\.protect_app_users_investor_id\(\)/,
  );
});

test("protect_app_users_investor_id rejects non-internal investor_id changes", () => {
  assert.match(
    SQL,
    /OLD\.investor_id IS DISTINCT FROM NEW\.investor_id[\s\S]+?NOT public\.is_internal_user\(\)/,
  );
});

test("protect_app_users_investor_id_trg trigger is registered BEFORE UPDATE", () => {
  assert.match(
    SQL,
    /CREATE TRIGGER protect_app_users_investor_id_trg[\s\S]+?BEFORE UPDATE ON "app_users"/,
  );
});

// ----------------------------------------------------------------------------
// Test 8: server-only guard on portal session + queries
// ----------------------------------------------------------------------------

test("session helpers have server-only guard", () => {
  for (const rel of [
    "src/lib/investor-portal/session.ts",
    "src/lib/investor-portal/queries.ts",
  ]) {
    assert.ok(exists(rel), `${rel} missing`);
    const src = read(rel);
    assert.match(src, /^import "server-only";/m, `${rel} missing server-only`);
  }
});

// ----------------------------------------------------------------------------
// Test 9: every query function calls requireInvestorSession (defense in depth)
// ----------------------------------------------------------------------------

test("every getMyXXX query in queries.ts calls requireInvestorSession", () => {
  const src = read("src/lib/investor-portal/queries.ts");
  const exports = src.matchAll(
    /export async function (getInvestorDashboard|getMy\w+)\(/g,
  );
  let count = 0;
  for (const m of exports) {
    const fn = m[1];
    count += 1;
    // Each function body must contain `requireInvestorSession()` call.
    const body = src.slice(src.indexOf(`function ${fn}`));
    const fnEnd = body.indexOf("\n}\n");
    const fnBody = body.slice(0, fnEnd);
    assert.match(
      fnBody,
      /requireInvestorSession\(\)/,
      `${fn} must call requireInvestorSession()`,
    );
  }
  assert.ok(count >= 8, `expected ≥8 portal queries, found ${count}`);
});

// ----------------------------------------------------------------------------
// Test 10: getMyWallet + getMyIRR additionally verify ownership in code
//         (defense in depth — RLS would also block, but explicit code check
//         gives clearer 401 than silent empty result)
// ----------------------------------------------------------------------------

test("getMyWallet verifies commitment ownership before returning", () => {
  const src = read("src/lib/investor-portal/queries.ts");
  const fn = src.slice(src.indexOf("export async function getMyWallet"));
  const end = fn.indexOf("\n}\n");
  const body = fn.slice(0, end);
  assert.match(body, /investorId, session\.investorId/);
  assert.match(body, /eq\(capitalCommitments\.investorId, session\.investorId\)/);
});

test("getMyIRR verifies commitment ownership before returning", () => {
  const src = read("src/lib/investor-portal/queries.ts");
  const fn = src.slice(src.indexOf("export async function getMyIRR"));
  const end = fn.indexOf("\n}\n");
  const body = fn.slice(0, end);
  assert.match(body, /eq\(capitalCommitments\.investorId, session\.investorId\)/);
});

// ----------------------------------------------------------------------------
// Test 11: requireInvestorSession throws on missing session
// ----------------------------------------------------------------------------

test("requireInvestorSession throws when getInvestorSession returns null", async () => {
  // Mock-stubbed import — we can't test full DB path here, but we can
  // verify the throw behavior of the wrapper. Use module-level mock by
  // intercepting the resolved getInvestorSession. Simpler: test the
  // composition directly by reading the source.
  const src = read("src/lib/investor-portal/session.ts");
  assert.match(src, /export async function requireInvestorSession/);
  assert.match(
    src,
    /if \(!s\) \{[\s\S]+?throw new Error/,
    "requireInvestorSession must throw on null session",
  );
  assert.match(src, /Unauthorized: this endpoint requires an investor portal session/);
});

// ----------------------------------------------------------------------------
// Test 12: getInvestorSession requires ALL of: auth, app_users.active,
//         investor_viewer role, non-null investor_id
// ----------------------------------------------------------------------------

test("getInvestorSession requires authUser + active + investor_viewer + investor_id", () => {
  const src = read("src/lib/investor-portal/session.ts");
  // The four gates must all be present
  assert.match(src, /eq\(appUsers\.authUserId, auth\.id\)/);
  assert.match(src, /eq\(appUsers\.status, "active"\)/);
  assert.match(src, /eq\(roles\.key, INVESTOR_ROLE_KEY\)/);
  assert.match(src, /INVESTOR_ROLE_KEY = "investor_viewer"/);
  // And final null-checks return null when investor link is missing
  assert.match(src, /if \(!r\.investorId.*\) return null/);
});
