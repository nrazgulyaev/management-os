/**
 * Stage 4.B.3 — Buyer Portal + Investor Write Surfaces tests.
 *
 * Static-source tests for migration 0050, schema, server modules, UI
 * routes (Dev OS internal + Buyer Portal + Investor write surfaces),
 * and RLS policies that enforce buyer/investor isolation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0050 = "drizzle/0050_development_os_stage_4_b_3_buyer_portal_writes.sql";

// ===========================================================================
// 1) Migration 0050 — shape
// ===========================================================================

test("migration 0050 file exists and wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0050));
  const sql = read(MIG_0050);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0050 creates 4 new tables", () => {
  const sql = read(MIG_0050);
  for (const t of [
    "buyers",
    "buyer_unit_assignments",
    "buyer_progress_reports",
    "investor_portal_requests",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `${t} table create missing`,
    );
  }
});

test("migration 0050 creates buyer KYC status enum (6 values)", () => {
  const sql = read(MIG_0050);
  for (const s of [
    "not_started",
    "in_progress",
    "submitted",
    "verified",
    "rejected",
    "expired",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `kyc_status '${s}' missing`);
  }
});

test("migration 0050 buyer_unit_assignments uses villas FK (not units)", () => {
  // Schema-name reconciliation: spec said units(id), actual is villas(id).
  const sql = read(MIG_0050);
  assert.match(
    sql,
    /buyer_unit_assignments[\s\S]+?REFERENCES "villas"\("id"\)/,
  );
});

test("migration 0050 buyer_progress_reports has 5-state status machine", () => {
  const sql = read(MIG_0050);
  for (const s of [
    "draft",
    "pending_approval",
    "approved",
    "published",
    "archived",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `report status '${s}' missing`);
  }
});

test("migration 0050 buyer_progress_reports carries internal_notes (never exposed)", () => {
  // The internal_notes column is the operator-only field. RLS hides
  // unpublished rows entirely, but the field exists for staff editing.
  const sql = read(MIG_0050);
  assert.match(sql, /buyer_progress_reports[\s\S]+?"internal_notes" TEXT/);
});

test("migration 0050 buyer_progress_reports has curated_photo_ids array", () => {
  const sql = read(MIG_0050);
  assert.match(sql, /"curated_photo_ids" UUID\[\]/);
});

test("migration 0050 investor_portal_requests covers all 4 request types", () => {
  const sql = read(MIG_0050);
  for (const t of [
    "withdrawal",
    "reinvest_to_project",
    "transfer_between_projects",
    "capital_call_response",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `request_type '${t}' missing`);
  }
});

test("migration 0050 investor_portal_requests covers all 6 statuses", () => {
  const sql = read(MIG_0050);
  for (const s of [
    "submitted",
    "under_review",
    "approved",
    "executed",
    "rejected",
    "cancelled",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `request status '${s}' missing`);
  }
});

test("migration 0050 investor_portal_requests references actual schema tables", () => {
  const sql = read(MIG_0050);
  assert.match(sql, /REFERENCES "capital_commitments"\("id"\)/);
  assert.match(sql, /REFERENCES "wallet_movements"\("id"\)/);
});

test("migration 0050 introduces public.is_buyer_user() + public.current_buyer_id() helpers", () => {
  const sql = read(MIG_0050);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_buyer_user\(\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.current_buyer_id\(\)/);
  assert.match(sql, /SECURITY DEFINER/);
});

test("migration 0050 RLS: buyers see only own row", () => {
  const sql = read(MIG_0050);
  assert.match(sql, /buyers_self_read/);
  assert.match(sql, /supabase_user_id = auth\.uid\(\)/);
});

test("migration 0050 RLS: buyers see only own unit assignments", () => {
  const sql = read(MIG_0050);
  assert.match(sql, /buyer_unit_assignments_buyer_read/);
  assert.match(sql, /buyer_id = public\.current_buyer_id\(\)/);
});

test("migration 0050 RLS: buyers see ONLY published reports for own units/projects", () => {
  const sql = read(MIG_0050);
  assert.match(sql, /buyer_progress_reports_buyer_read/);
  assert.match(sql, /status = 'published'/);
  // Project-level reports also visible if the buyer owns at least one unit there.
  assert.match(sql, /unit_id IS NULL AND project_id IN/);
});

test("migration 0050 RLS: investors see only own portal requests + can insert own", () => {
  const sql = read(MIG_0050);
  assert.match(sql, /investor_portal_requests_self_read/);
  assert.match(sql, /investor_portal_requests_self_insert/);
  assert.match(sql, /current_investor_id\(\)/);
});

test("migration 0050 enforces ALL 4 tables FORCE ROW LEVEL SECURITY", () => {
  const sql = read(MIG_0050);
  for (const t of [
    "buyers",
    "buyer_unit_assignments",
    "buyer_progress_reports",
    "investor_portal_requests",
  ]) {
    assert.match(
      sql,
      new RegExp(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY`),
      `${t} must FORCE RLS`,
    );
  }
});

// ===========================================================================
// 2) Drizzle schema files
// ===========================================================================

test("Stage 4.B.3 schema files exist + are re-exported", () => {
  assert.ok(exists("src/lib/db/schema/buyers.ts"));
  assert.ok(exists("src/lib/db/schema/investor-portal-requests.ts"));
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/buyers";/);
  assert.match(idx, /export \* from "\.\/investor-portal-requests";/);
});

test("buyers schema declares internalNotes (never exposed via portal)", () => {
  const src = read("src/lib/db/schema/buyers.ts");
  assert.match(src, /internalNotes/);
});

// ===========================================================================
// 3) Server modules — files exist + use server-only
// ===========================================================================

test("Stage 4.B.3 server modules exist + carry server-only", () => {
  for (const rel of [
    "src/lib/development/server/buyers/buyer-queries.ts",
    "src/lib/development/server/buyers/buyer-actions.ts",
    "src/lib/development/server/buyers/buyer-progress-actions.ts",
    "src/lib/development/server/investor-portal-requests/request-queries.ts",
    "src/lib/development/server/investor-portal-requests/request-actions.ts",
  ]) {
    assert.ok(exists(rel), `missing ${rel}`);
    const src = read(rel);
    assert.match(src, /^(import "server-only"|"use server")/m, `${rel} missing server-only`);
  }
});

test("buyer-actions: createBuyer auto-generates BYR-### code", () => {
  const src = read("src/lib/development/server/buyers/buyer-actions.ts");
  assert.match(src, /BYR-\$\{next\}/);
});

test("buyer-progress-actions: state machine guards illegal transitions", () => {
  const src = read(
    "src/lib/development/server/buyers/buyer-progress-actions.ts",
  );
  // Spec-mandated transitions only.
  assert.match(src, /draft.*pending_approval.*archived/);
  assert.match(src, /pending_approval.*approved/);
  assert.match(src, /approved.*published/);
  assert.match(src, /cannot transition report from/);
});

test("buyer-progress-actions: publishing stamps published_at", () => {
  const src = read(
    "src/lib/development/server/buyers/buyer-progress-actions.ts",
  );
  assert.match(src, /publishedAt = new Date/);
});

test("request-actions: submitInvestorPortalRequest auto-generates IRQ-YYYY-#### code", () => {
  const src = read(
    "src/lib/development/server/investor-portal-requests/request-actions.ts",
  );
  assert.match(src, /IRQ-\$\{year\}-\$\{seq\}/);
});

test("request-actions: refuses to execute non-approved requests", () => {
  // Defense in depth — operator UI should also gate, but the action
  // refuses to write a wallet_movement unless status='approved'.
  const src = read(
    "src/lib/development/server/investor-portal-requests/request-actions.ts",
  );
  assert.match(src, /cannot execute request in status/);
  assert.match(src, /must be 'approved'/);
});

test("request-actions: execution wraps wallet_movement + status update in db.transaction (atomic)", () => {
  const src = read(
    "src/lib/development/server/investor-portal-requests/request-actions.ts",
  );
  assert.match(src, /db\.transaction/);
});

test("request-actions: execution links wallet_movement back to request via related_wallet_movement_id", () => {
  const src = read(
    "src/lib/development/server/investor-portal-requests/request-actions.ts",
  );
  assert.match(src, /relatedWalletMovementId: movement\.id/);
});

test("request-actions: cancelInvestorPortalRequest refuses to cancel executed requests", () => {
  const src = read(
    "src/lib/development/server/investor-portal-requests/request-actions.ts",
  );
  assert.match(src, /cannot cancel executed request/);
});

test("request-actions: review action enforces valid state transitions", () => {
  const src = read(
    "src/lib/development/server/investor-portal-requests/request-actions.ts",
  );
  assert.match(src, /cannot review request in status/);
});

test("request-actions: submit does NOT require internal user (investor self-write)", () => {
  // The submit path is the only operation invoked by the investor
  // themselves. RLS gates investor_id; no requireInternalUser *call*.
  const src = read(
    "src/lib/development/server/investor-portal-requests/request-actions.ts",
  );
  const submitFnMatch = src.match(
    /export async function submitInvestorPortalRequest[\s\S]+?^}/m,
  );
  assert.ok(submitFnMatch, "could not locate submitInvestorPortalRequest");
  // Ensure no actual *invocation* — the comment may reference the name.
  assert.doesNotMatch(submitFnMatch![0], /await\s+requireInternalUser\(\)/);
});

// ===========================================================================
// 4) Cron jobs — 3 new + dispatcher + HTTP routes
// ===========================================================================

test("3 new cron job runners exist", () => {
  for (const rel of [
    "src/lib/development/server/cron/wallet-recompute-job.ts",
    "src/lib/development/server/cron/buyer-progress-reminder-job.ts",
    "src/lib/development/server/cron/investor-request-escalation-job.ts",
  ]) {
    assert.ok(exists(rel));
  }
});

test("3 new cron HTTP routes exist", () => {
  for (const rel of [
    "src/app/api/cron/dev-os-wallet-recompute/route.ts",
    "src/app/api/cron/dev-os-buyer-progress-reminder/route.ts",
    "src/app/api/cron/dev-os-investor-request-escalation/route.ts",
  ]) {
    assert.ok(exists(rel));
  }
});

test("3 new cron jobs registered in dev-os cron index", () => {
  const src = read("src/lib/development/server/cron/index.ts");
  for (const k of [
    "dev_os_wallet_recompute",
    "dev_os_buyer_progress_reminder",
    "dev_os_investor_request_escalation",
  ]) {
    assert.ok(src.includes(`"${k}"`), `cron index missing ${k}`);
  }
});

test("3 new cron jobs registered in jobs/actions.ts dispatcher", () => {
  const src = read("src/features/jobs/actions.ts");
  for (const k of [
    "dev_os_wallet_recompute",
    "dev_os_buyer_progress_reminder",
    "dev_os_investor_request_escalation",
  ]) {
    assert.ok(src.includes(`"${k}"`), `dispatcher missing ${k}`);
  }
  // Confirm the runner functions are also imported.
  assert.match(src, /runDevOsWalletRecompute/);
  assert.match(src, /runDevOsBuyerProgressReminder/);
  assert.match(src, /runDevOsInvestorRequestEscalation/);
});

test("vercel cron checklist documents the 3 new schedules", () => {
  const src = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(src, /dev-os-wallet-recompute.*0 3 \* \* \*/);
  assert.match(src, /dev-os-buyer-progress-reminder.*0 9 \* \* 1/);
  assert.match(src, /dev-os-investor-request-escalation.*0 9 \* \* \*/);
});

test("wallet-recompute job is idempotent (read + recompute + update)", () => {
  const src = read(
    "src/lib/development/server/cron/wallet-recompute-job.ts",
  );
  // Recompute = pure derivation from source-of-truth tables.
  assert.match(src, /residualInventoryValueMinor: residualValue/);
  assert.match(src, /economicBalanceMinor: economic/);
  assert.match(src, /lastRecomputedAt: new Date/);
});

// ===========================================================================
// 5) UI routes — Dev OS internal
// ===========================================================================

const DEV_OS_INTERNAL_ROUTES = [
  "src/app/(development-app)/development-os/projects/[slug]/company/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/company/[id]/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/waterfall/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/waterfall/simulator/page.tsx",
  "src/app/(development-app)/development-os/residual-inventory/page.tsx",
  "src/app/(development-app)/development-os/residual-inventory/[unitId]/page.tsx",
  "src/app/(development-app)/development-os/buyers/page.tsx",
  "src/app/(development-app)/development-os/buyers/[code]/page.tsx",
  "src/app/(development-app)/development-os/investor-requests/page.tsx",
  "src/app/(development-app)/development-os/investor-requests/[code]/page.tsx",
  "src/app/(development-app)/development-os/investors/[code]/capital-account/page.tsx",
];

test("all 11 Dev OS internal Stage 4.B routes exist", () => {
  for (const rel of DEV_OS_INTERNAL_ROUTES) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("all Dev OS internal pages wrap in DevelopmentShell + force-dynamic", () => {
  for (const rel of DEV_OS_INTERNAL_ROUTES) {
    const src = read(rel);
    assert.match(src, /DevelopmentShell/, `${rel} missing DevelopmentShell`);
    assert.match(src, /dynamic = "force-dynamic"/, `${rel} missing force-dynamic`);
  }
});

test("waterfall simulator page mounts the client component", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/waterfall/simulator/page.tsx",
  );
  assert.match(src, /WaterfallSimulator/);
});

test("waterfall simulator client component uses pure helper directly", () => {
  // Pure helper has no server-only guard, so it bundles cleanly into the
  // client. This guarantees the simulator's math matches the real engine.
  const src = read(
    "src/components/development/waterfall/waterfall-simulator.tsx",
  );
  assert.match(src, /^"use client"/m);
  assert.match(src, /computeWaterfallAllocation/);
  // Imports from the pure helper file (not the server action wrapper).
  assert.match(src, /waterfall-helpers/);
});

test("investor request detail mounts review-actions client component", () => {
  const src = read(
    "src/app/(development-app)/development-os/investor-requests/[code]/page.tsx",
  );
  assert.match(src, /RequestReviewActions/);
});

test("RequestReviewActions client component binds to review + execute server actions", () => {
  const src = read(
    "src/components/development/investor-portal-requests/request-review-actions.tsx",
  );
  assert.match(src, /^"use client"/m);
  assert.match(src, /reviewInvestorPortalRequest/);
  assert.match(src, /executeInvestorPortalRequest/);
});

test("capital-account page surfaces all 6 balance buckets", () => {
  const src = read(
    "src/app/(development-app)/development-os/investors/[code]/capital-account/page.tsx",
  );
  for (const label of [
    "Cash",
    "Economic",
    "Reinvestment",
    "Committed",
    "Pending distribution",
    "Residual inventory",
  ]) {
    assert.ok(src.includes(label), `bucket label '${label}' missing`);
  }
});

// ===========================================================================
// 6) Buyer Portal workspace — separate (3rd) workspace
// ===========================================================================

const BUYER_PORTAL_ROUTES = [
  "src/app/(buyer-portal)/layout.tsx",
  "src/app/(buyer-portal)/buyer-portal/page.tsx",
  "src/app/(buyer-portal)/buyer-portal/login/page.tsx",
  "src/app/(buyer-portal)/buyer-portal/dashboard/page.tsx",
  "src/app/(buyer-portal)/buyer-portal/units/page.tsx",
  "src/app/(buyer-portal)/buyer-portal/reports/page.tsx",
  "src/app/(buyer-portal)/buyer-portal/reports/[id]/page.tsx",
];

test("Buyer Portal: all routes exist (separate workspace)", () => {
  for (const rel of BUYER_PORTAL_ROUTES) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("Buyer Portal layout uses distinct background (not Development OS / Investor Portal)", () => {
  const src = read("src/app/(buyer-portal)/layout.tsx");
  // Buyer-tone background — neither operator nor investor.
  assert.match(src, /bg-\[#FAF7F2\]/);
});

test("Buyer Portal uses BuyerShell (separate from PortalShell + DevelopmentShell)", () => {
  for (const rel of [
    "src/app/(buyer-portal)/buyer-portal/dashboard/page.tsx",
    "src/app/(buyer-portal)/buyer-portal/units/page.tsx",
    "src/app/(buyer-portal)/buyer-portal/reports/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /BuyerShell/, `${rel} must use BuyerShell`);
    assert.doesNotMatch(src, /DevelopmentShell/, `${rel} must NOT use DevelopmentShell`);
    assert.doesNotMatch(src, /PortalShell/, `${rel} must NOT use PortalShell`);
  }
});

test("Buyer Portal authenticated pages redirect to /buyer-portal/login on null session", () => {
  for (const rel of [
    "src/app/(buyer-portal)/buyer-portal/dashboard/page.tsx",
    "src/app/(buyer-portal)/buyer-portal/units/page.tsx",
    "src/app/(buyer-portal)/buyer-portal/reports/page.tsx",
    "src/app/(buyer-portal)/buyer-portal/reports/[id]/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(
      src,
      /redirect\("\/buyer-portal\/login"\)/,
      `${rel} must redirect to login on null session`,
    );
  }
});

test("Buyer Portal report detail enforces published status (defense in depth)", () => {
  // RLS already filters this row out for buyers, but the page also checks
  // explicitly so a misconfigured policy doesn't accidentally leak.
  const src = read(
    "src/app/(buyer-portal)/buyer-portal/reports/[id]/page.tsx",
  );
  assert.match(src, /report\.status !== "published"/);
});

test("Buyer Portal session helper exists + checks portal_access_enabled", () => {
  assert.ok(exists("src/lib/buyer-portal/session.ts"));
  const src = read("src/lib/buyer-portal/session.ts");
  assert.match(src, /portalAccessEnabled/);
  assert.match(src, /^(import "server-only"|"use server")/m);
});

test("Buyer Portal pages do NOT import any internal_notes column", () => {
  // Defense in depth: even though RLS hides drafts, code should not
  // request the internal_notes field on the buyer side.
  for (const rel of BUYER_PORTAL_ROUTES) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /internalNotes|internal_notes/,
      `${rel} must NOT touch internal_notes`,
    );
  }
});

test("Buyer Portal pages do NOT import any Development OS components", () => {
  for (const rel of BUYER_PORTAL_ROUTES) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /@\/components\/development\//,
      `${rel} must NOT import Development OS components`,
    );
    assert.doesNotMatch(
      src,
      /lib\/development\/server/,
      `${rel} must NOT import Development OS server actions`,
    );
  }
});

// ===========================================================================
// 7) Investor portal write surfaces
// ===========================================================================

const INVESTOR_WRITE_ROUTES = [
  "src/app/(investor-portal)/investor-portal/wallet/withdraw/page.tsx",
  "src/app/(investor-portal)/investor-portal/wallet/reinvest/page.tsx",
  "src/app/(investor-portal)/investor-portal/requests/page.tsx",
];

test("Investor portal write surface routes exist", () => {
  for (const rel of INVESTOR_WRITE_ROUTES) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("Investor write surface client forms exist + use 'use client'", () => {
  for (const rel of [
    "src/components/investor-portal/withdraw-request-form.tsx",
    "src/components/investor-portal/reinvest-request-form.tsx",
  ]) {
    assert.ok(exists(rel));
    const src = read(rel);
    assert.match(src, /^"use client"/m);
    assert.match(src, /useTransition/);
    assert.match(src, /submitInvestorPortalRequest/);
  }
});

test("Investor write surfaces gated through getInvestorSession + redirect on null", () => {
  for (const rel of INVESTOR_WRITE_ROUTES) {
    const src = read(rel);
    assert.match(src, /getInvestorSession/);
    assert.match(src, /redirect\("\/investor-portal\/login"\)/);
  }
});

test("Withdraw form clamps amount to available cash (defense in depth)", () => {
  // RLS + server action also enforce, but UX should refuse the click.
  const src = read(
    "src/components/investor-portal/withdraw-request-form.tsx",
  );
  assert.match(src, /Amount exceeds available cash/);
});

test("Reinvest form distinguishes reinvest_to_project vs transfer_between_projects", () => {
  // The action choice depends on whether source == target project.
  const src = read(
    "src/components/investor-portal/reinvest-request-form.tsx",
  );
  assert.match(src, /sourceProjectId === targetId/);
  assert.match(src, /reinvest_to_project/);
  assert.match(src, /transfer_between_projects/);
});

test("Investor write forms surface the no-money-moves-on-submit message", () => {
  // Investor-trust point: explicitly tell them submission is just a request.
  for (const rel of [
    "src/components/investor-portal/withdraw-request-form.tsx",
    "src/components/investor-portal/reinvest-request-form.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /no money moves until/);
  }
});

// ===========================================================================
// 8) Cross-workspace separation regression (3 workspaces now)
// ===========================================================================

test("Buyer Portal and Development OS use distinct route groups (no leakage)", () => {
  // Buyer Portal lives in (buyer-portal); Dev OS in (development-app);
  // Investor Portal in (investor-portal). Three-way isolation.
  assert.ok(exists("src/app/(buyer-portal)/layout.tsx"));
  assert.ok(exists("src/app/(development-app)"));
  assert.ok(exists("src/app/(investor-portal)/layout.tsx"));
});

test("Buyer Portal never imports Dev OS shells or schemas it doesn't need", () => {
  // The only shared module a buyer page should reach for is the schema
  // package and the buyer-portal session helper. Cross-check that.
  const dashboard = read(
    "src/app/(buyer-portal)/buyer-portal/dashboard/page.tsx",
  );
  assert.doesNotMatch(dashboard, /investor-portal/);
  assert.doesNotMatch(dashboard, /development-os/);
});

test("Buyer-side queries scoped through getBuyerSession (no internal user fallback)", () => {
  // If a buyer page accidentally called a function that requires an
  // internal user, the page would fail closed. Guard against accidental
  // imports from features/auth/permissions.
  for (const rel of BUYER_PORTAL_ROUTES.filter(
    (r) => !r.includes("login") && !r.includes("/buyer-portal/page.tsx") && !r.includes("layout"),
  )) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /requireInternalUser/,
      `${rel} must NOT call requireInternalUser`,
    );
  }
});
