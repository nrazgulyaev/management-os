/**
 * Stage 10.5.A.3 — Final-batch cabinet dashboards (Sales / Warehouse /
 * Front Office) + /dashboard/{role} redirect convention + cross-cabinet
 * consistency review acceptance tests.
 *
 * 10.5.A.3.1 — Sales Manager (Dev OS) replatformed.
 * 10.5.A.3.2 — Warehouse Manager (Dev OS) replatformed.
 * 10.5.A.3.3 — Front Office (Mgmt OS) replatformed.
 * 10.5.A.3.4 — 8 thin redirect pages at /dashboard/{role} forwarding
 *              to /development-os/cabinets/{role}, so users typing
 *              the Mgmt OS URL pattern always land on the canonical
 *              cabinet route.
 * 10.5.A.3.5 — Cross-cabinet pattern audit: every cabinet (10 total)
 *              imports DashboardKpi + PageHeaderHero, and no cabinet
 *              still imports the legacy MetricCard.
 *
 * 10.5.A.3.6 — docs/STAGE-10-5-A-COMPLETE.md ships the closure for
 *              the entire Stage 10.5.A theme.
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

const SALES =
  "src/app/(development-app)/development-os/cabinets/sales-manager/page.tsx";
const WAREHOUSE =
  "src/app/(development-app)/development-os/cabinets/warehouse-manager/page.tsx";
const FRONT_OFFICE = "src/app/(dashboard)/dashboard/front-office/page.tsx";

const DEV_OS_CABINETS = [
  { key: "cfo-accountant", file: "cfo-accountant" },
  { key: "marketing-staff", file: "marketing-staff" },
  { key: "procurement-manager", file: "procurement-manager" },
  { key: "project-manager", file: "project-manager" },
  { key: "qs", file: "qs" },
  { key: "sales-manager", file: "sales-manager" },
  { key: "site-supervisor", file: "site-supervisor" },
  { key: "warehouse-manager", file: "warehouse-manager" },
] as const;

const ALL_CABINET_PAGES = [
  // Mgmt OS
  "src/app/(dashboard)/dashboard/owner/page.tsx",
  "src/app/(dashboard)/dashboard/front-office/page.tsx",
  // Dev OS (8)
  ...DEV_OS_CABINETS.map(
    (c) => `src/app/(development-app)/development-os/cabinets/${c.file}/page.tsx`,
  ),
];

const DECISIONS_DOC = "tmp/stage-10-5-a-3-decisions.md";
const CLOSURE_DOC = "docs/STAGE-10-5-A-COMPLETE.md";

// ============================================================================
// 10.5.A.3.1-3 — Per-cabinet contract for the three new replatforms
// ============================================================================

const NEW_PAGES = [
  { key: "sales-manager", path: SALES, gate: "sales-manager" },
  { key: "warehouse-manager", path: WAREHOUSE, gate: "warehouse-manager" },
  // Front Office is in Mgmt OS; gating happens at the (dashboard) layout
  // (enforceProductAccess("mgmt")) — no per-page gateCabinetForCurrentOrg.
];

for (const p of NEW_PAGES) {
  test(`10.5.A.3 — ${p.key} page imports DashboardKpi + PageHeaderHero (no legacy MetricCard)`, () => {
    const src = read(p.path);
    assert.match(src, /\bDashboardKpi\b/);
    assert.match(src, /\bPageHeaderHero\b/);
    assert.doesNotMatch(src, /from "@\/components\/ui\/metric-card"/);
  });

  test(`10.5.A.3 — ${p.key} page renders ≥ 4 headline KPI tiles`, () => {
    const src = read(p.path);
    const kpiMatches = src.match(/<DashboardKpi/g) ?? [];
    assert.ok(
      kpiMatches.length >= 4,
      `${p.key}: expected ≥4 DashboardKpi tiles, got ${kpiMatches.length}`,
    );
  });

  test(`10.5.A.3 — ${p.key} page is gated by gateCabinetForCurrentOrg("${p.gate}")`, () => {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`gateCabinetForCurrentOrg\\("${p.gate}"\\)`),
    );
  });

  test(`10.5.A.3 — ${p.key} page uses the 2/3-1/3 body split pattern`, () => {
    const src = read(p.path);
    assert.match(src, /lg:col-span-2/);
    assert.match(src, /<aside/);
  });
}

// Front Office is Mgmt OS — separate assertions (no cabinet gate, no DevelopmentShell).
test("10.5.A.3.3 — Front Office (Mgmt OS) imports DashboardKpi + PageHeaderHero", () => {
  const src = read(FRONT_OFFICE);
  assert.match(src, /\bDashboardKpi\b/);
  assert.match(src, /\bPageHeaderHero\b/);
  assert.doesNotMatch(src, /from "@\/components\/ui\/metric-card"/);
});

test("10.5.A.3.3 — Front Office renders 4 headline KPIs + 2/3-1/3 split", () => {
  const src = read(FRONT_OFFICE);
  const kpis = src.match(/<DashboardKpi/g) ?? [];
  assert.ok(kpis.length >= 4, `front-office expected ≥4 KPIs, got ${kpis.length}`);
  assert.match(src, /lg:col-span-2/);
  assert.match(src, /<aside/);
});

test("10.5.A.3.3 — Front Office surfaces Arrivals / Departures / In-house / Pending requests labels", () => {
  const src = read(FRONT_OFFICE);
  assert.match(src, /Arrivals today/);
  assert.match(src, /Departures today/);
  assert.match(src, /In-house/);
  assert.match(src, /Pending requests/);
});

test("10.5.A.3.1 — Sales page surfaces per-manager pipeline + weekly snapshot section", () => {
  const src = read(SALES);
  assert.match(src, /Hot leads/);
  assert.match(src, /Active conversations/);
  assert.match(src, /Reservations \(MTD\)/);
  assert.match(src, /Overdue follow-ups/);
  // Weekly snapshot only renders when data.managerWeeklySnapshot is present.
  assert.match(src, /managerWeeklySnapshot/);
});

test("10.5.A.3.2 — Warehouse page surfaces SKU / low / zero / QA labels", () => {
  const src = read(WAREHOUSE);
  assert.match(src, /Total SKUs/);
  assert.match(src, /Low stock/);
  assert.match(src, /Zero stock/);
  assert.match(src, /QA on materials/);
});

// ============================================================================
// 10.5.A.3.4 — /dashboard/{role} redirects to Dev OS cabinets
// ============================================================================

for (const c of DEV_OS_CABINETS) {
  test(`10.5.A.3.4 — /dashboard/${c.key}/page.tsx redirects to /development-os/cabinets/${c.key}`, () => {
    const path = `src/app/(dashboard)/dashboard/${c.key}/page.tsx`;
    assert.ok(
      exists(path),
      `expected redirect page at ${path} so /dashboard/${c.key} doesn't 404`,
    );
    const src = read(path);
    assert.match(src, /from "next\/navigation"/);
    assert.match(
      src,
      new RegExp(`redirect\\("/development-os/cabinets/${c.key}"\\)`),
    );
  });
}

// ============================================================================
// 10.5.A.3.5 — Cross-cabinet consistency: every cabinet on the pattern
// ============================================================================

for (const path of ALL_CABINET_PAGES) {
  test(`10.5.A.3.5 — every cabinet on the pattern: ${path} imports DashboardKpi + PageHeaderHero`, () => {
    const src = read(path);
    assert.match(
      src,
      /\bDashboardKpi\b/,
      `${path} must import DashboardKpi (Stage 10.5.A pattern)`,
    );
    assert.match(
      src,
      /\bPageHeaderHero\b/,
      `${path} must import PageHeaderHero (Stage 10.5.A pattern)`,
    );
  });

  test(`10.5.A.3.5 — every cabinet on the pattern: ${path} no longer imports legacy MetricCard`, () => {
    const src = read(path);
    assert.doesNotMatch(
      src,
      /from "@\/components\/ui\/metric-card"/,
      `${path} must not import the legacy MetricCard — Stage 10.5.A migrated all 10 cabinets`,
    );
  });
}

// ============================================================================
// Decisions + closure docs
// ============================================================================

test("10.5.A.3 — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists(DECISIONS_DOC));
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 10\.5 \/ PHASE 10\.5\.A\.3 ACCEPTED/);
  // The redirect convention must be documented.
  assert.match(doc, /redirect/i);
});

test("10.5.A.3.6 — STAGE-10-5-A-COMPLETE.md closure doc shipped", () => {
  assert.ok(exists(CLOSURE_DOC));
  const doc = read(CLOSURE_DOC);
  // Closes the Stage 10.5.A theme overall.
  assert.match(doc, /Stage 10\.5\.A.*COMPLETE/i);
  // Names all 10 cabinets.
  for (const role of [
    "Owner",
    "CFO",
    "Project Manager",
    "Site Supervisor",
    "QS",
    "Procurement",
    "Marketing",
    "Sales",
    "Warehouse",
    "Front Office",
  ]) {
    assert.match(
      doc,
      new RegExp(role, "i"),
      `closure doc must name the ${role} cabinet`,
    );
  }
});
