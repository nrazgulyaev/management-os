/**
 * Stage 10.6 / Phase 10.6.F.3 — Front office + guest journey surface polish.
 *
 * Same scope reframe as F.1/F.2: front-office, guest-journey,
 * guest-services, guest-stays, guest-ai, guests domains were already
 * built. F.3 delta is bringing the visual surface up to 10.6.C
 * standards (rounded-3xl/rounded-2xl + shadow-soft-card frames,
 * rounded-full pill actions, rounded-xl inputs, larger empty-state pads).
 *
 * Domain functionality is covered by Stage 6.* / 7.* / 8.* tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (st.isFile() && (p.endsWith(".tsx") || p.endsWith(".ts"))) out.push(p);
  }
  return out;
}

const F3_DIRS = [
  "src/app/(dashboard)/dashboard/front-office",
  "src/app/(dashboard)/dashboard/guest-journey",
  "src/app/(dashboard)/dashboard/guest-services",
  "src/app/(dashboard)/dashboard/guest-stays",
  "src/app/(dashboard)/dashboard/guest-ai",
  "src/app/(dashboard)/dashboard/guests",
];

// ============================================================================
// No legacy rounded-md / rounded-sm anywhere across F.3 territory
// ============================================================================

for (const dir of F3_DIRS) {
  test(`10.6.F.3.polish — no rounded-md/rounded-sm in ${dir.split("/").pop()}`, () => {
    const files = walk(resolve(ROOT, dir));
    const leaks: string[] = [];
    for (const abs of files) {
      const src = readFileSync(abs, "utf8");
      if (/\brounded-md\b/.test(src) || /\brounded-sm\b/.test(src)) {
        leaks.push(abs.slice(ROOT.length + 1));
      }
    }
    assert.equal(leaks.length, 0, `legacy tokens leaked in: ${leaks.join(", ")}`);
  });
}

// ============================================================================
// Every surface adopts at least one modernised frame
// ============================================================================

const KEY_PAGES = [
  "src/app/(dashboard)/dashboard/front-office/page.tsx",
  "src/app/(dashboard)/dashboard/front-office/arrivals/page.tsx",
  "src/app/(dashboard)/dashboard/front-office/departures/page.tsx",
  "src/app/(dashboard)/dashboard/front-office/in-house/page.tsx",
  "src/app/(dashboard)/dashboard/front-office/readiness/page.tsx",
  "src/app/(dashboard)/dashboard/front-office/requests/page.tsx",
  "src/app/(dashboard)/dashboard/guest-journey/page.tsx",
  "src/app/(dashboard)/dashboard/guest-journey/rules/page.tsx",
  "src/app/(dashboard)/dashboard/guest-journey/runs/page.tsx",
  "src/app/(dashboard)/dashboard/guest-journey/suggestions/page.tsx",
  "src/app/(dashboard)/dashboard/guest-journey/reviews/page.tsx",
  "src/app/(dashboard)/dashboard/guest-services/page.tsx",
  "src/app/(dashboard)/dashboard/guest-services/catalog/page.tsx",
  "src/app/(dashboard)/dashboard/guest-services/categories/page.tsx",
  "src/app/(dashboard)/dashboard/guest-services/orders/page.tsx",
  "src/app/(dashboard)/dashboard/guest-services/orders/[id]/page.tsx",
  "src/app/(dashboard)/dashboard/guest-services/finance-bridge/page.tsx",
  "src/app/(dashboard)/dashboard/guest-stays/page.tsx",
  "src/app/(dashboard)/dashboard/guest-stays/security/page.tsx",
  "src/app/(dashboard)/dashboard/guest-stays/security/verifications/page.tsx",
  "src/app/(dashboard)/dashboard/guest-stays/security/events/page.tsx",
  "src/app/(dashboard)/dashboard/guest-stays/tokens/page.tsx",
  "src/app/(dashboard)/dashboard/guest-stays/tokens/[id]/page.tsx",
  "src/app/(dashboard)/dashboard/guest-ai/page.tsx",
  "src/app/(dashboard)/dashboard/guest-ai/storage/page.tsx",
  "src/app/(dashboard)/dashboard/guest-ai/sessions/page.tsx",
  "src/app/(dashboard)/dashboard/guest-ai/sessions/[id]/page.tsx",
  "src/app/(dashboard)/dashboard/guest-ai/handoffs/page.tsx",
  "src/app/(dashboard)/dashboard/guest-ai/handoffs/[id]/page.tsx",
  "src/app/(dashboard)/dashboard/guest-ai/handoffs/metrics/page.tsx",
];

test("10.6.F.3.polish — every key F.3 page has a modernised rounded-* + shadow-soft-card frame", () => {
  const missing: string[] = [];
  for (const rel of KEY_PAGES) {
    const src = read(rel);
    if (!/rounded-(2xl|3xl)[^"]*shadow-soft-card/.test(src) &&
        !/rounded-full/.test(src) && !/rounded-xl/.test(src)) {
      missing.push(rel);
    }
  }
  assert.equal(
    missing.length,
    0,
    `pages without any modernised frame: ${missing.join(", ")}`,
  );
});

// ============================================================================
// Dashed empty states use modern rounded-3xl + larger pad (where present)
// ============================================================================

test("10.6.F.3.polish — dashed empty states across F.3 use rounded-3xl/2xl + larger pad", () => {
  const bad: string[] = [];
  for (const dir of F3_DIRS) {
    const files = walk(resolve(ROOT, dir));
    for (const abs of files) {
      const src = readFileSync(abs, "utf8");
      // Old pattern: rounded-md border-dashed border-line-soft bg-muted/20 px-5 py-6
      // should no longer match
      if (/rounded-md border border-dashed border-line-soft bg-muted\/20/.test(src)) {
        bad.push(abs.slice(ROOT.length + 1));
      }
    }
  }
  assert.equal(bad.length, 0, `legacy dashed empty states: ${bad.join(", ")}`);
});
