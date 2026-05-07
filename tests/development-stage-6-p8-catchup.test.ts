/**
 * Stage 6.P8-CATCHUP — Cabinets verification + sidebar audit + "Soon"
 * features triage.
 *
 * Validates:
 *   - 9 role cabinets exist + render real personalized data via cabinet-
 *     queries modules (not stub UI).
 *   - `/development-os/cabinets/my-cabinet` is wired to user identity via
 *     `resolveLandingPageForUserId`.
 *   - "Soon" features (`/quantity-surveying`, `/warehouse`) have a clear
 *     triage outcome documented inline.
 *   - Sidebar navigation has no broken routes.
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

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ===========================================================================
// 1) 9 role cabinets exist
// ===========================================================================

const CABINETS = [
  "cfo-accountant",
  "marketing-staff",
  "procurement-manager",
  "project-manager",
  "qs",
  "sales-manager",
  "site-supervisor",
  "warehouse-manager",
  "my-cabinet",
];

test("9 role cabinets exist under /development-os/cabinets/", () => {
  for (const slug of CABINETS) {
    assert.ok(
      fileExists(
        `src/app/(development-app)/development-os/cabinets/${slug}/page.tsx`,
      ),
      `cabinet ${slug} missing`,
    );
  }
});

// ===========================================================================
// 2) Each non-redirect cabinet imports a cabinet-queries loader (real data)
// ===========================================================================

test("non-redirect cabinets import cabinet-queries (real personalized data)", () => {
  // Skip my-cabinet (it's a redirect).
  for (const slug of CABINETS.filter((s) => s !== "my-cabinet")) {
    const path = `src/app/(development-app)/development-os/cabinets/${slug}/page.tsx`;
    const src = readFile(path);
    // Cabinet-queries module pattern: imports from `cabinets/*-cabinet-queries`
    // OR pulls from a per-cabinet query module. Either way the page must
    // touch a real loader rather than be a hardcoded stub.
    const hasRealLoad =
      /from\s+["']@\/lib\/development\/server\/cabinets\//.test(src) ||
      /from\s+["']@\/features\/.*\/cabinet-queries["']/.test(src) ||
      /loadCfoCabinet|loadProjectManagerCabinet|loadSiteSupervisorCabinet|loadProcurementCabinet|loadQsCabinet|loadSalesCabinet|loadWarehouseCabinet|loadMarketingCabinet/.test(
        src,
      );
    assert.ok(hasRealLoad, `cabinet ${slug} appears to be a stub`);
  }
});

// ===========================================================================
// 3) my-cabinet wired to user identity
// ===========================================================================

test("/cabinets/my-cabinet redirects via resolveLandingPageForUserId", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/cabinets/my-cabinet/page.tsx",
  );
  assert.match(src, /getCurrentAppUser/);
  assert.match(src, /resolveLandingPageForUserId/);
  assert.match(src, /redirect\(/);
});

// ===========================================================================
// 4) Landing resolver maps roles to cabinets
// ===========================================================================

test("role-helpers maps every primary role to a cabinet route", () => {
  // The landing resolver pulls from `role-helpers.ts` where the
  // role -> cabinet mapping lives.
  const src = readFile("src/lib/development/server/roles/role-helpers.ts");
  for (const slug of CABINETS.filter((s) => s !== "my-cabinet")) {
    assert.match(
      src,
      new RegExp(`/development-os/cabinets/${slug.replace(/-/g, "-")}`),
      `role-helpers does not point to ${slug}`,
    );
  }
});

// ===========================================================================
// 5) Soon features triage
// ===========================================================================

test("'/quantity-surveying' is a documented Coming Soon placeholder", () => {
  const path =
    "src/app/(development-app)/development-os/quantity-surveying/page.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /Coming Soon|Roadmap/i);
});

test("Warehouse: warehouse-manager cabinet covers the operator surface", () => {
  // Per triage, no separate `/warehouse` route — the warehouse-manager
  // cabinet is the operator-facing surface. The navigation entry maps
  // to that cabinet.
  assert.ok(
    fileExists(
      "src/app/(development-app)/development-os/cabinets/warehouse-manager/page.tsx",
    ),
  );
  const nav = readFile("src/lib/development/navigation.ts");
  assert.match(nav, /\/cabinets\/warehouse-manager/);
});

// ===========================================================================
// 6) Sidebar navigation pointers resolve to real routes
// ===========================================================================

test("navigation: every /cabinets/<slug> reference points to a real cabinet", () => {
  const nav = readFile("src/lib/development/navigation.ts");
  const matches = nav.match(/\/development-os\/cabinets\/([a-z-]+)/g) ?? [];
  for (const m of matches) {
    const slug = m.replace("/development-os/cabinets/", "");
    assert.ok(
      fileExists(
        `src/app/(development-app)/development-os/cabinets/${slug}/page.tsx`,
      ),
      `navigation points to /cabinets/${slug} but no page.tsx exists`,
    );
  }
});

// ===========================================================================
// 7) Architecture doc bookkeeping
// ===========================================================================

test("arch doc: P8 carries CATCHUP marker (active or accepted)", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(
    src,
    /Stage 6\.P8 — Polish \+ Comprehensive Testing .*\[(ACTIVE|ACCEPTED) 6\.P8-CATCHUP\]/,
  );
});
