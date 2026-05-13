/**
 * Stage 8.C — authenticated workflow trace acceptance tests.
 *
 * The runtime portion (real Chromium auditing the live deployment)
 * lives in `scripts/workflow-trace.ts`. These tests cover:
 *
 *   1. The trace harness itself — reusable structure that future
 *      stages can extend with new workflows.
 *   2. Per-workflow code-path invariants — every component / action
 *      that a workflow step depends on must continue to exist. If
 *      future refactors delete one, this suite catches it before the
 *      runtime trace fails on a real environment.
 *
 * The 6 workflows traced:
 *   A — Booking lifecycle
 *   B — BOQ → Procurement
 *   C — Maintenance ticket assign
 *   D — Marketing connection
 *   E — Banking connection
 *   F — Sign-up flow
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
// 8.C.0 — Harness invariants
// ===========================================================================

test("8.C.0: workflow-trace.ts harness shipped + supports all 6 workflows", () => {
  const path = "scripts/workflow-trace.ts";
  assert.ok(exists(path));
  const src = read(path);
  // Each of the 6 workflows is implemented as its own function.
  assert.match(src, /workflowA_BookingLifecycle\b/);
  assert.match(src, /workflowB_BoqProcurement\b/);
  assert.match(src, /workflowC_MaintenanceTicket\b/);
  assert.match(src, /workflowD_MarketingConnection\b/);
  assert.match(src, /workflowE_BankingConnection\b/);
  assert.match(src, /workflowF_SignUpFlow\b/);
  // Harness writes a structured report.
  assert.match(src, /tmp\/workflow-trace-results\.json/);
  // Login flow is reused from audit-bot env.
  assert.match(src, /AUDIT_BOT_EMAIL/);
  assert.match(src, /AUDIT_BOT_PASSWORD/);
});

// ===========================================================================
// 8.C — Workflow A: Booking lifecycle invariants
// ===========================================================================

test("8.C.A: booking workflow surfaces (holds, requests, bookings, front-office) all exist", () => {
  for (const route of [
    "src/app/(dashboard)/dashboard/direct-bookings/holds/page.tsx",
    "src/app/(dashboard)/dashboard/direct-bookings/requests/page.tsx",
    "src/app/(dashboard)/dashboard/bookings/page.tsx",
    "src/app/(dashboard)/dashboard/front-office/arrivals/page.tsx",
    "src/app/(dashboard)/dashboard/front-office/departures/page.tsx",
    "src/app/(dashboard)/dashboard/front-office/in-house/page.tsx",
  ]) {
    assert.ok(exists(route), `booking workflow route missing: ${route}`);
  }
});

test("8.C.A: check-in / check-out buttons component shipped (Stage 7.F.A.1)", () => {
  assert.ok(
    exists("src/components/front-office/check-in-out-buttons.tsx"),
    "CheckInButton + CheckOutButton from Stage 7.F.A.1 must remain shipped",
  );
});

// ===========================================================================
// 8.C — Workflow B: BOQ → Procurement invariants
// ===========================================================================

test("8.C.B: BOQ index + new + dev-os procurement requests exist", () => {
  for (const route of [
    "src/app/(development-app)/development-os/boq/page.tsx",
    "src/app/(development-app)/development-os/boq/new/page.tsx",
    "src/app/(development-app)/development-os/procurement/purchase-requests/page.tsx",
  ]) {
    assert.ok(exists(route), `BOQ/procurement route missing: ${route}`);
  }
});

test("8.C.B: Generate-RFQ-from-BOQ button shipped (Stage 7.F.D.1)", () => {
  assert.ok(
    exists("src/components/development/boq/generate-rfq-button.tsx"),
    "GenerateRfqFromBoqButton must remain shipped",
  );
});

test("8.C.B: dev-os RFQ approve/reject component shipped (Stage 7.F.A.3)", () => {
  assert.ok(
    exists("src/components/development/procurement/request-actions.tsx"),
    "DevOsPurchaseRequestActions must remain shipped",
  );
});

test("8.C.B: BOQ /new still has empty-projects guard (Stage 8.A.6 regression-guard)", () => {
  const src = read("src/app/(development-app)/development-os/boq/new/page.tsx");
  assert.match(src, /No projects yet/);
});

// ===========================================================================
// 8.C — Workflow C: Maintenance assign invariants
// ===========================================================================

test("8.C.C: maintenance list + detail routes exist", () => {
  assert.ok(exists("src/app/(dashboard)/dashboard/operations/maintenance/page.tsx"));
  assert.ok(
    exists("src/app/(dashboard)/dashboard/operations/maintenance/[id]/page.tsx"),
  );
});

test("8.C.C: MaintenanceAssignDropdown component shipped (Stage 7.F.A.2)", () => {
  assert.ok(
    exists("src/components/operations/maintenance-assign.tsx"),
    "MaintenanceAssignDropdown must remain shipped",
  );
});

test("8.C.C: assignMaintenanceTicketAction action remains exported", () => {
  const src = read("src/features/operations/actions.ts");
  assert.match(src, /export\s+async\s+function\s+assignMaintenanceTicketAction\b/);
});

// ===========================================================================
// 8.C — Workflow D: Marketing connection invariants
// ===========================================================================

test("8.C.D: marketing connections list + new + detail routes exist", () => {
  for (const route of [
    "src/app/(development-app)/development-os/marketing/connections/page.tsx",
    "src/app/(development-app)/development-os/marketing/connections/new/page.tsx",
    "src/app/(development-app)/development-os/marketing/connections/[id]/page.tsx",
  ]) {
    assert.ok(exists(route), `marketing connection route missing: ${route}`);
  }
});

test("8.C.D: marketing connection components + actions shipped (Stage 7.F.B.1)", () => {
  assert.ok(exists("src/components/marketing/connect-marketing-form.tsx"));
  assert.ok(exists("src/components/marketing/connection-actions-buttons.tsx"));
  assert.ok(exists("src/lib/marketing/connection-actions.ts"));
});

test("8.C.D: marketing actions cover create/test/sync/disconnect", () => {
  const src = read("src/lib/marketing/connection-actions.ts");
  assert.match(src, /createMarketingConnectionAction\b/);
  assert.match(src, /testMarketingConnectionAction\b/);
  assert.match(src, /syncMarketingConnectionNowAction\b/);
  assert.match(src, /disconnectMarketingConnectionAction\b/);
});

// ===========================================================================
// 8.C — Workflow E: Banking connection invariants
// ===========================================================================

test("8.C.E: banking list + new + detail routes exist (Stage 7.F.B.3)", () => {
  for (const route of [
    "src/app/(development-app)/development-os/banking/page.tsx",
    "src/app/(development-app)/development-os/banking/new/page.tsx",
    "src/app/(development-app)/development-os/banking/[id]/page.tsx",
  ]) {
    assert.ok(exists(route), `banking route missing: ${route}`);
  }
});

test("8.C.E: banking connection components + actions shipped", () => {
  assert.ok(exists("src/components/banking/connect-bank-form.tsx"));
  assert.ok(exists("src/components/banking/connection-actions-buttons.tsx"));
  assert.ok(exists("src/lib/banking/connection-actions.ts"));
});

// ===========================================================================
// 8.C — Workflow F: Sign-up flow invariants
// ===========================================================================

test("8.C.F: sign-up route + pricing + legal placeholders exist (post Sprint-3a/3b)", () => {
  // Stage 7.E /sign-up auth route still ships.
  assert.ok(exists("src/app/(auth)/sign-up/page.tsx"));
  // Stage 10.I.5 added a public marketing signup at /signup.
  assert.ok(exists("src/app/(public)/signup/page.tsx"));
  // Sprint 3a's consolidated /pricing page (Sprint 3b retired the
  // per-product /pricing/management-os and /pricing/development-os
  // pages — both 308 to /pricing via next.config.mjs).
  assert.ok(exists("src/app/(public)/pricing/page.tsx"));
  // Stage 8.A.2 placeholders.
  assert.ok(exists("src/app/(public)/legal/terms/page.tsx"));
  assert.ok(exists("src/app/(public)/legal/privacy/page.tsx"));
});

test("8.C.F: sign-up form's POST target — known broken, deferred to Stage 9", () => {
  // Phase 8.C discovery: the sign-up form posts to /api/onboarding/start
  // which does not exist. Building the full onboarding endpoint
  // (Supabase auth user creation + org provisioning + email
  // verification + optional Stripe Checkout) is LARGE work — deferred
  // to Stage 9 commerce activation per the Phase 8.C plan rule
  // "LARGE issues → defer to Stage 9 with documentation."
  //
  // This test asserts the gap stays visible: when the route handler
  // is finally built, this test should be flipped to assert the route
  // exists. Until then, it documents the broken state.
  const formSrc = read("src/app/(auth)/sign-up/page.tsx");
  const targetMatch = formSrc.match(/<form[^>]+action="(\/[^"]+)"/);
  assert.ok(targetMatch, "sign-up form should have an action attr");
  const target = targetMatch![1];
  const candidates = [
    `src${target}/route.ts`,
    `src/app${target}/route.ts`,
    `src/app${target}.ts`,
  ];
  const routeExists = candidates.some((p) => exists(p));
  // Either: (a) Stage 9 has built the route → flip this assertion to
  // ok, or (b) we're still pre-Stage-9 and the gap is documented.
  if (routeExists) {
    assert.ok(true, "sign-up endpoint shipped (Stage 9 commerce activation)");
  } else {
    assert.equal(
      target,
      "/api/onboarding/start",
      "documented gap: sign-up posts to /api/onboarding/start which is not yet implemented",
    );
  }
});

// ===========================================================================
// Phase 8.C closure
// ===========================================================================

test("Phase 8.C: no new migrations", () => {
  assert.ok(
    !exists("drizzle/0087_development_os_stage_8_c.sql"),
    "Phase 8.C is verification-only — no migration expected",
  );
});
