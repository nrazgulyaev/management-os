/**
 * Stage 8.A — Production hygiene acceptance tests.
 *
 * Items covered:
 *   8.A.1 — system/health uses bulk pg_stat_user_tables lookup (not 39-way fan-out)
 *   8.A.2 — /legal/terms + /legal/privacy pages exist
 *   8.A.3 — 8 paid cabinets call gateCabinetForCurrentOrg
 *   8.A.4 — /my-cabinet redirects via landing-resolver (verified no-op)
 *   8.A.5 — WifiMigrateButton accepts kmsReady prop and disables when false
 *   8.A.6 — BOQ /new page guards empty-projects with EmptyState + CTA
 *   8.A.7 — SW staleWhileRevalidate clones response before async cache.put
 *   8.A.7 — All 8 PWA icon files referenced by manifest exist
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
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
// 8.A.1 — system/health bulk query
// ===========================================================================

test("8.A.1: system/health uses pg_stat_user_tables (no 39-way COUNT fan-out)", () => {
  const src = read("src/app/(dashboard)/dashboard/system/health/page.tsx");
  // The bulk helper is invoked.
  assert.match(src, /getApproximateRowCounts\(/);
  // The old fan-out is gone.
  assert.doesNotMatch(
    src,
    /Promise\.all\(\s*TRACKED_TABLES\.map/,
    "fan-out Promise.all on TRACKED_TABLES must be removed",
  );
});

test("8.A.1: getApproximateRowCounts is exported from db-health", () => {
  const src = read("src/features/system/db-health.ts");
  assert.match(src, /export\s+async\s+function\s+getApproximateRowCounts\b/);
  // Uses pg_stat_user_tables.
  assert.match(src, /pg_stat_user_tables/);
  // Returns missing_relation for tables not in the catalog.
  assert.match(src, /missing_relation/);
});

// ===========================================================================
// 8.A.2 — legal pages
// ===========================================================================

test("8.A.2: /legal/terms page exists + renders Terms heading", () => {
  const path = "src/app/(public)/legal/terms/page.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /Terms of Service/);
});

test("8.A.2: /legal/privacy page exists + renders Privacy heading", () => {
  const path = "src/app/(public)/legal/privacy/page.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /Privacy Policy/);
});

// ===========================================================================
// 8.A.3 — cabinet gating rollout
// ===========================================================================

const PAID_CABINETS = [
  "site-supervisor",
  "project-manager",
  "cfo-accountant",
  "qs",
  "procurement-manager",
  "warehouse-manager",
  "marketing-staff",
  "sales-manager",
];

test("8.A.3: every paid cabinet calls gateCabinetForCurrentOrg + redirect", () => {
  for (const slug of PAID_CABINETS) {
    const src = read(
      `src/app/(development-app)/development-os/cabinets/${slug}/page.tsx`,
    );
    assert.match(
      src,
      /gateCabinetForCurrentOrg\(/,
      `${slug} cabinet must call gateCabinetForCurrentOrg`,
    );
    assert.match(
      src,
      /redirect\(/,
      `${slug} cabinet must redirect on positive gate result`,
    );
  }
});

test("8.A.3: gateCabinetForCurrentOrg helper exported with ARCONIQUE_DEFAULT fallback", () => {
  const src = read("src/lib/billing/cabinet-gating.ts");
  assert.match(src, /export\s+async\s+function\s+gateCabinetForCurrentOrg\b/);
  assert.match(src, /ARCONIQUE_DEFAULT/);
});

// ===========================================================================
// 8.A.4 — my-cabinet identity wire (already shipped — verify no regression)
// ===========================================================================

test("8.A.4: /my-cabinet uses resolveLandingPageForUserId", () => {
  const src = read(
    "src/app/(development-app)/development-os/cabinets/my-cabinet/page.tsx",
  );
  assert.match(src, /resolveLandingPageForUserId\(/);
  assert.match(src, /getCurrentAppUser\(/);
});

// ===========================================================================
// 8.A.5 — wifi migrate sweep button
// ===========================================================================

test("8.A.5: WifiMigrateButton accepts kmsReady prop + disables when false", () => {
  const src = read("src/components/guest-stays/wifi-migrate-button.tsx");
  assert.match(src, /kmsReady/);
  assert.match(src, /disabled=\{[^}]*!kmsReady[^}]*\}/);
});

test("8.A.5: wifi/migrate page passes kmsReady to button", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/villa-guides/wifi/migrate/page.tsx",
  );
  assert.match(src, /<WifiMigrateButton\s+kmsReady=\{kmsReady\}/);
});

// ===========================================================================
// 8.A.6 — BOQ /new empty-projects guard
// ===========================================================================

test("8.A.6: BOQ /new short-circuits to EmptyState when no projects", () => {
  const src = read("src/app/(development-app)/development-os/boq/new/page.tsx");
  assert.match(src, /projectRows\.length\s*===\s*0/);
  assert.match(src, /No projects yet/);
  // CTA points to projects index.
  assert.match(src, /\/development-os\/projects/);
});

// ===========================================================================
// 8.A.7 — SW + PWA icons
// ===========================================================================

test("8.A.7: sw.js staleWhileRevalidate clones response BEFORE async cache.put", () => {
  const src = read("public/sw.js");
  // The fix: clone is bound to a local before the caches.open(...).then(...)
  assert.match(
    src,
    /const\s+clone\s*=\s*response\.clone\(\)\s*;[\s\S]{0,200}caches\.open\([^)]+\)\.then\(\(c\)\s*=>\s*c\.put\(request,\s*clone\)\)/,
    "clone must be captured synchronously and used in the async cache write",
  );
  // The buggy pattern (clone inside the async then-callback) should be gone.
  assert.doesNotMatch(
    src,
    /caches\.open\([^)]+\)\.then\(\(c\)\s*=>\s*c\.put\(request,\s*response\.clone\(\)/,
    "the broken pattern (response.clone() inside the inner then) must be removed",
  );
});

test("8.A.7: all 8 PWA icon files referenced by manifest exist", () => {
  const manifest = JSON.parse(read("public/manifest.json")) as {
    icons: Array<{ src: string }>;
  };
  for (const icon of manifest.icons) {
    const rel = icon.src.replace(/^\//, "public/");
    assert.ok(exists(rel), `manifest icon ${icon.src} must exist as ${rel}`);
  }
});
