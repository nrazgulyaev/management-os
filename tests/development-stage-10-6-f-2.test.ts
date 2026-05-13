/**
 * Stage 10.6 / Phase 10.6.F.2 — Operations + maintenance-intelligence
 * surface polish.
 *
 * Same scope reframe as F.1: the ops + maintenance-intelligence
 * domains were already deeply built. The F.2 delta is bringing the
 * visual surface up to 10.6.C standards (rounded-3xl + shadow-soft-card
 * frames, rounded-full pill actions, larger empty-state pads).
 *
 * Domain functionality is covered by Stage 5.J / 6.G / 7.E test suites.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const OPS_PAGES = [
  "src/app/(dashboard)/dashboard/operations/page.tsx",
  "src/app/(dashboard)/dashboard/operations/tasks/[id]/page.tsx",
  "src/app/(dashboard)/dashboard/operations/checklists/page.tsx",
  "src/app/(dashboard)/dashboard/operations/service-requests/page.tsx",
  "src/app/(dashboard)/dashboard/operations/damage-reports/page.tsx",
];

const MAINT_PAGES = [
  "src/app/(dashboard)/dashboard/maintenance-intelligence/page.tsx",
  "src/app/(dashboard)/dashboard/maintenance-intelligence/plans/page.tsx",
  "src/app/(dashboard)/dashboard/maintenance-intelligence/plans/[id]/page.tsx",
  "src/app/(dashboard)/dashboard/maintenance-intelligence/risks/page.tsx",
  "src/app/(dashboard)/dashboard/maintenance-intelligence/templates/page.tsx",
  "src/app/(dashboard)/dashboard/maintenance-intelligence/windows/page.tsx",
];

const ALL = [...OPS_PAGES, ...MAINT_PAGES];

// ============================================================================
// Token modernization — no rounded-md / rounded-sm anywhere in either surface
// ============================================================================

test("10.6.F.2.polish — no rounded-md/rounded-sm legacy tokens in operations surface", () => {
  for (const rel of OPS_PAGES) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /\brounded-md\b/,
      `${rel} still uses legacy rounded-md`,
    );
    assert.doesNotMatch(
      src,
      /\brounded-sm\b/,
      `${rel} still uses legacy rounded-sm`,
    );
  }
});

test("10.6.F.2.polish — no rounded-md/rounded-sm legacy tokens in maintenance-intelligence surface", () => {
  for (const rel of MAINT_PAGES) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /\brounded-md\b/,
      `${rel} still uses legacy rounded-md`,
    );
    assert.doesNotMatch(
      src,
      /\brounded-sm\b/,
      `${rel} still uses legacy rounded-sm`,
    );
  }
});

// ============================================================================
// Card frames adopt rounded-3xl + shadow-soft-card
// ============================================================================

test("10.6.F.2.polish — every page has at least one modernised rounded-3xl + shadow-soft-card frame", () => {
  for (const rel of ALL) {
    const src = read(rel);
    assert.match(
      src,
      /rounded-3xl[^"]*shadow-soft-card|rounded-2xl[^"]*shadow-soft-card/,
      `${rel} missing modernised frame`,
    );
  }
});

// ============================================================================
// Maintenance-intelligence index — QuickLink/Card adopts hover:shadow-elevated-card
// ============================================================================

test("10.6.F.2.polish — maintenance-intelligence index Card uses rounded-2xl + hover:shadow-elevated-card", () => {
  const src = read("src/app/(dashboard)/dashboard/maintenance-intelligence/page.tsx");
  assert.match(src, /rounded-2xl[^"]*shadow-soft-card[^"]*hover:shadow-elevated-card/);
});

test("10.6.F.2.polish — maintenance-intelligence index 'Risk feed' action is pill (rounded-full)", () => {
  const src = read("src/app/(dashboard)/dashboard/maintenance-intelligence/page.tsx");
  assert.match(src, /rounded-full border border-line-soft/);
});

// ============================================================================
// Dashed empty-state callouts get the larger pad (px-7 py-8 or p-7)
// ============================================================================

test("10.6.F.2.polish — dashed empty-state callouts use rounded-3xl + larger pad", () => {
  for (const rel of ALL) {
    const src = read(rel);
    if (/border-dashed border-line-soft bg-muted\/20/.test(src)) {
      assert.match(
        src,
        /rounded-3xl border border-dashed border-line-soft bg-muted\/20 (?:px-7 py-8|p-7)/,
        `${rel} dashed empty-state not modernised`,
      );
    }
  }
});
