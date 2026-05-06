/**
 * Stage 4 — sidebar + missing pages fix.
 *
 * Smoke tests for the 6 routes the local walkthrough flagged as broken
 * + audits every sidebar entry to confirm it points to a page that
 * actually exists on disk.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const NEW_ROUTES = {
  taxReports:
    "src/app/(development-app)/development-os/finance/tax-reports/page.tsx",
  quotations:
    "src/app/(development-app)/development-os/procurement/quotations/page.tsx",
  schedule: "src/app/(development-app)/development-os/schedule/page.tsx",
  reports: "src/app/(development-app)/development-os/reports/page.tsx",
  settings: "src/app/(development-app)/development-os/settings/page.tsx",
  procurementRoot:
    "src/app/(development-app)/development-os/procurement/page.tsx",
  quantitySurveying:
    "src/app/(development-app)/development-os/quantity-surveying/page.tsx",
} as const;

test("/finance/tax-reports list page exists + uses listTaxPeriodReports", () => {
  assert.ok(exists(NEW_ROUTES.taxReports));
  const src = read(NEW_ROUTES.taxReports);
  assert.match(src, /listTaxPeriodReports/);
  assert.match(src, /DevelopmentShell/);
  assert.match(src, /force-dynamic/);
  assert.match(src, /safeQuery/);
});

test("/procurement/quotations global list exists + queries procurement_quotations", () => {
  assert.ok(exists(NEW_ROUTES.quotations));
  const src = read(NEW_ROUTES.quotations);
  assert.match(src, /procurementQuotations/);
  // Joins to vendors + dev_os_purchase_requests for the cross-PR view.
  assert.match(src, /vendors/);
  assert.match(src, /devOsPurchaseRequests/);
  assert.match(src, /DevelopmentShell/);
  assert.match(src, /force-dynamic/);
  assert.match(src, /safeQuery/);
});

test("/schedule global overview exists + aggregates per-project task data", () => {
  assert.ok(exists(NEW_ROUTES.schedule));
  const src = read(NEW_ROUTES.schedule);
  assert.match(src, /work_packages/);
  assert.match(src, /project_tasks/);
  assert.match(src, /is_on_critical_path/);
  // Per-project cards link to the existing per-project schedule page.
  assert.match(src, /\/development-os\/projects\/\$\{p\.slug\}\/schedule/);
  assert.match(src, /DevelopmentShell/);
  assert.match(src, /force-dynamic/);
  assert.match(src, /safeQuery/);
});

test("/reports index links to all Stage 5.C visual report types", () => {
  assert.ok(exists(NEW_ROUTES.reports));
  const src = read(NEW_ROUTES.reports);
  // Stage 5.C replaced the placeholder with the visual-reports index.
  for (const href of [
    "/development-os/reports/cashflow-waterfall",
    "/development-os/reports/s-curve",
    "/development-os/reports/budget-burn",
    "/development-os/reports/cost-heatmap",
    "/development-os/reports/investor-capital-timeline",
    "/development-os/reports/sales-funnel",
    "/development-os/reports/workforce-productivity",
    "/development-os/reports/procurement-delays",
  ]) {
    assert.ok(src.includes(href), `report link '${href}' missing`);
  }
  assert.match(src, /DevelopmentShell/);
  assert.match(src, /force-dynamic/);
});

test("/settings index exists with cards linking to all sub-pages", () => {
  assert.ok(exists(NEW_ROUTES.settings));
  const src = read(NEW_ROUTES.settings);
  // All five sub-page links per spec — including the cross-section tax-types one.
  for (const href of [
    "/development-os/settings/ai-usage",
    "/development-os/settings/notifications",
    "/development-os/settings/whatsapp",
    "/development-os/settings/approval-thresholds",
    "/development-os/finance/tax-types",
  ]) {
    assert.ok(src.includes(href), `settings card missing href '${href}'`);
  }
  assert.match(src, /DevelopmentShell/);
  assert.match(src, /force-dynamic/);
});

test("Sidebar audit: every developmentAppNav href points to an existing page.tsx", () => {
  // Parse every `href: ${DEVELOPMENT_APP_PATH}<path>` reference in the nav file.
  const nav = read("src/lib/development/navigation.ts");
  const matches = nav.matchAll(
    /href:\s*`\$\{DEVELOPMENT_APP_PATH\}([^`]*)`/g,
  );
  const broken: string[] = [];
  for (const m of matches) {
    const subpath = m[1];
    if (subpath === "") continue; // Root command-center entry.
    const rel = `src/app/(development-app)/development-os${subpath}/page.tsx`;
    if (!exists(rel)) broken.push(`${subpath}  →  ${rel}`);
  }
  assert.deepEqual(
    broken,
    [],
    `${broken.length} broken sidebar link(s):\n${broken.join("\n")}`,
  );
});

test("Sidebar: /warehouse no longer 404s — repointed to /inventory/items", () => {
  const nav = read("src/lib/development/navigation.ts");
  // The href line is the line immediately above `label: "Warehouse"`.
  const idx = nav.indexOf('label: "Warehouse"');
  assert.ok(idx !== -1, "Warehouse nav entry not found");
  const window = nav.slice(Math.max(0, idx - 200), idx);
  assert.match(
    window,
    /\$\{DEVELOPMENT_APP_PATH\}\/inventory\/items/,
    "Warehouse must point to /inventory/items, not /warehouse",
  );
  // Defense in depth: no nav entry anywhere should still point to /warehouse.
  assert.doesNotMatch(
    nav,
    /\$\{DEVELOPMENT_APP_PATH\}\/warehouse[`,]/,
    "no nav entry should point to /warehouse (page does not exist)",
  );
});

test("Sidebar roadmap: 'soon' badges only on truly-deferred items", () => {
  const nav = read("src/lib/development/navigation.ts");
  // After this fix, only Reports + Quantity Surveying remain `soon`.
  // Schedule, QA/QC, Warehouse all have shipped pages and no longer get `soon`.
  // Find the Roadmap section text.
  const roadmapSection = nav.match(
    /label:\s*"Roadmap"[\s\S]*?\],\s*\}/,
  );
  assert.ok(roadmapSection, "Roadmap section not found");
  // QA/QC, Warehouse, Schedule must NOT have `badge: "soon"` in this section
  // (they got upgraded to 4.C since pages exist).
  const roadmapText = roadmapSection![0];
  // Count 'soon' occurrences — should be limited to genuine deferrals.
  const soonCount = (roadmapText.match(/badge: "soon"/g) ?? []).length;
  assert.ok(
    soonCount <= 2,
    `expected ≤ 2 'soon' badges in Roadmap section (Reports + Quantity Surveying), got ${soonCount}`,
  );
});

test("Stage 4 fix: total of 7 new page files created (6 spec routes + procurement root)", () => {
  for (const rel of Object.values(NEW_ROUTES)) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});
