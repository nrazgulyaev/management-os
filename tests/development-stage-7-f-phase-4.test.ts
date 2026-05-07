/**
 * Stage 7.F.D — Phase 4 (Polish) acceptance tests.
 *
 * Sub-items delivered:
 *   D.1 RFQ-from-BOQ auto-link
 *   D.3 Plan-tier cabinet gating helper
 *   D.4 Notifications provider status section
 *
 * D.2 (empty-state CTA sweep) deferred — the audit's gap concentration
 * was Connection UIs (covered Phases 2+3); empty-state polish is lower-
 * leverage and can land incrementally.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { CABINET_TO_FLAG } from "../src/lib/billing/cabinet-flags";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ===========================================================================
// 7.F.D.1 — RFQ from BOQ
// ===========================================================================

test("7.F.D.1: generatePurchaseRequestsFromBoqAction exported", () => {
  const src = readFile(
    "src/lib/development/server/procurement/procurement-actions.ts",
  );
  assert.match(
    src,
    /export\s+async\s+function\s+generatePurchaseRequestsFromBoqAction\b/,
  );
});

test("7.F.D.1: action validates input + requires procurement_manager role", () => {
  const src = readFile(
    "src/lib/development/server/procurement/procurement-actions.ts",
  );
  // Schema present.
  assert.match(src, /generateRequestsFromBoqSchema/);
  // Role check.
  assert.match(src, /procurement_manager/);
  // Caps batch at 100 to prevent runaway inserts.
  assert.match(src, /\.max\(100\)/);
});

test("7.F.D.1: action joins BOQ items → sections → documents for projectId", () => {
  const src = readFile(
    "src/lib/development/server/procurement/procurement-actions.ts",
  );
  assert.match(src, /\.innerJoin\(boqSections,\s*eq\(boqSections\.id,\s*boqItems\.sectionId\)\)/);
  assert.match(
    src,
    /\.innerJoin\(boqDocuments,\s*eq\(boqDocuments\.id,\s*boqSections\.boqDocumentId\)\)/,
  );
});

test("7.F.D.1: button component exists + posts to action", () => {
  const path =
    "src/components/development/boq/generate-rfq-button.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /export\s+function\s+GenerateRfqFromBoqButton\b/);
  assert.match(src, /generatePurchaseRequestsFromBoqAction/);
});

test("7.F.D.1: BOQ detail page wires the generate button", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/boq/[code]/page.tsx",
  );
  assert.match(src, /GenerateRfqFromBoqButton/);
  assert.match(src, /allItemIds/);
});

// ===========================================================================
// 7.F.D.3 — Cabinet plan-tier gating
// ===========================================================================

test("7.F.D.3: cabinet-gating module exists + maps all 8 paid-tier cabinets", () => {
  const path = "src/lib/billing/cabinet-gating.ts";
  assert.ok(fileExists(path));
  for (const slug of [
    "cfo-accountant",
    "project-manager",
    "site-supervisor",
    "qs",
    "procurement-manager",
    "warehouse-manager",
    "marketing-staff",
    "sales-manager",
  ]) {
    assert.ok(slug in CABINET_TO_FLAG, `${slug} must have flag mapping`);
  }
});

test("7.F.D.3: gateCabinet helper delegates to pageGate", () => {
  const src = readFile("src/lib/billing/cabinet-gating.ts");
  assert.match(src, /export\s+async\s+function\s+gateCabinet\b/);
  assert.match(src, /pageGate\(/);
  // Cabinets without a flag mapping (e.g. my-cabinet) bypass gating.
  assert.match(src, /bypass gating/);
});

test("7.F.D.3: flag codes match the seed in migration 0085", () => {
  // Spot-check: the flags used here must exist in the seed data.
  const seed = readFile(
    "drizzle/0085_development_os_stage_7_b_subscription_plans.sql",
  );
  for (const flag of Object.values(CABINET_TO_FLAG)) {
    assert.ok(
      seed.includes(`'${flag}'`),
      `${flag} must be seeded in migration 0085`,
    );
  }
});

// ===========================================================================
// 7.F.D.4 — Notifications provider status
// ===========================================================================

test("7.F.D.4: notifications settings page renders provider status", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/settings/notifications/page.tsx",
  );
  assert.match(src, /Provider configuration/);
  assert.match(src, /isResendConfigured/);
  assert.match(src, /isTwilioConfigured/);
  assert.match(src, /isNotificationsDryRun/);
});

test("7.F.D.4: status card shows DRY RUN vs LIVE", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/settings/notifications/page.tsx",
  );
  assert.match(src, /"DRY RUN"|"LIVE"/);
  assert.match(src, /NOTIFICATIONS_DRY_RUN/);
});

// ===========================================================================
// Phase 4 closure
// ===========================================================================

test("Phase 4: no new migrations", () => {
  // Latest migration remains 0086.
  assert.ok(
    !fileExists("drizzle/0087_development_os_stage_7_f_phase_4.sql"),
  );
});
