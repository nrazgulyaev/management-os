/**
 * Stage 2.4 — Site Operations + Vendor CRM + Material Tracking + Safety.
 *
 * Static-source tests covering schema, server-only guards, transactional
 * patterns, cron registration, UI structure, and seed shape. Pure-function
 * coverage for constants. DB-backed integration is in the manual checklist.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ----------------------------------------------------------------------------
// 1) Migration 0040 — file content
// ----------------------------------------------------------------------------

const MIGRATION_PATH =
  "drizzle/0040_development_os_stage_2_4_site_operations.sql";

test("migration 0040 exists", () => {
  assert.ok(exists(MIGRATION_PATH));
});

const SQL = exists(MIGRATION_PATH) ? read(MIGRATION_PATH) : "";

test("migration 0040 creates all 13 Stage 2.4 tables", () => {
  for (const t of [
    "vendors",
    "vendor_engagements",
    "site_zones",
    "site_reports",
    "site_report_zones",
    "site_report_photos",
    "site_workforce_logs",
    "material_purchase_orders",
    "material_po_lines",
    "material_deliveries",
    "material_delivery_lines",
    "material_consumption_logs",
    "safety_incidents",
  ]) {
    assert.match(
      SQL,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing CREATE TABLE for ${t}`,
    );
  }
});

test("migration 0040 enables ENABLE+FORCE RLS for every Stage 2.4 table", () => {
  for (const t of [
    "vendors",
    "vendor_engagements",
    "site_zones",
    "site_reports",
    "site_report_zones",
    "site_report_photos",
    "site_workforce_logs",
    "material_purchase_orders",
    "material_po_lines",
    "material_deliveries",
    "material_delivery_lines",
    "material_consumption_logs",
    "safety_incidents",
  ]) {
    assert.match(SQL, new RegExp(`'${t}'`), `${t} missing from RLS loop`);
  }
  assert.match(SQL, /FORCE ROW LEVEL SECURITY/);
});

test("migration 0040 widens dev_notification_rules CHECK with 4 new events", () => {
  for (const ev of [
    "material_delivery_overdue",
    "site_report_missing",
    "safety_incident_severe",
    "safety_incident_unresolved_24h",
  ]) {
    assert.ok(SQL.includes(`'${ev}'`), `notification CHECK missing ${ev}`);
  }
});

test("migration 0040 declares generated columns on workforce + po_lines", () => {
  // Multi-line column defs — match across newlines via /s flag.
  assert.match(
    SQL,
    /"total_man_hours"[\s\S]+?GENERATED ALWAYS AS \("worker_count" \* "hours_per_worker"\) STORED/,
  );
  assert.match(
    SQL,
    /"line_total_usd_minor"[\s\S]+?GENERATED ALWAYS AS \(\("unit_price_usd_minor" \* "quantity_ordered"\)::bigint\) STORED/,
  );
});

test("migration 0040 enforces UNIQUE (project_id, report_date) on site_reports", () => {
  assert.match(
    SQL,
    /UNIQUE \(\s*"project_id",\s*"report_date"\s*\)/,
  );
});

test("migration 0040 enforces UNIQUE (po_id, line_number) on po_lines", () => {
  assert.match(
    SQL,
    /UNIQUE \(\s*"po_id",\s*"line_number"\s*\)/,
  );
});

test("migration 0040 wraps in BEGIN ... COMMIT", () => {
  assert.match(SQL, /^BEGIN;/m);
  assert.match(SQL, /^COMMIT;/m);
});

// ----------------------------------------------------------------------------
// 2) Drizzle schema
// ----------------------------------------------------------------------------

test("Drizzle site-operations schema exports all 13 tables", () => {
  const src = read("src/lib/db/schema/site-operations.ts");
  for (const exportName of [
    "vendors",
    "vendorEngagements",
    "siteZones",
    "siteReports",
    "siteReportZones",
    "siteReportPhotos",
    "siteWorkforceLogs",
    "materialPurchaseOrders",
    "materialPoLines",
    "materialDeliveries",
    "materialDeliveryLines",
    "materialConsumptionLogs",
    "safetyIncidents",
  ]) {
    assert.match(
      src,
      new RegExp(`export const ${exportName}\\s`),
      `missing export const ${exportName}`,
    );
  }
});

test("schema/index.ts re-exports site-operations", () => {
  const src = read("src/lib/db/schema/index.ts");
  assert.match(src, /export \* from "\.\/site-operations"/);
});

// ----------------------------------------------------------------------------
// 3) Pure constants — every enum has a label map
// ----------------------------------------------------------------------------

test("VENDOR_TYPES has full label coverage", async () => {
  const m = await import("../src/lib/development/constants/vendor-constants");
  for (const t of m.VENDOR_TYPES) {
    assert.ok(m.VENDOR_TYPE_LABEL[t], `missing label for ${t}`);
  }
});

test("ZONE_TYPES has full label coverage", async () => {
  const m = await import("../src/lib/development/constants/site-constants");
  for (const t of m.ZONE_TYPES) {
    assert.ok(m.ZONE_TYPE_LABEL[t], `missing label for ${t}`);
  }
});

test("WORKFORCE_ROLES has full label coverage", async () => {
  const m = await import("../src/lib/development/constants/site-constants");
  for (const r of m.WORKFORCE_ROLES) {
    assert.ok(m.WORKFORCE_ROLE_LABEL[r], `missing label for ${r}`);
  }
});

test("MATERIAL_PO_STATUSES + MATERIAL_QUALITY_STATUSES have full label coverage", async () => {
  const m = await import("../src/lib/development/constants/material-constants");
  for (const s of m.MATERIAL_PO_STATUSES) {
    assert.ok(m.MATERIAL_PO_STATUS_LABEL[s]);
  }
  for (const s of m.MATERIAL_QUALITY_STATUSES) {
    assert.ok(m.MATERIAL_QUALITY_LABEL[s]);
  }
});

test("SAFETY_SEVERITIES + categories + statuses have full label coverage", async () => {
  const m = await import("../src/lib/development/constants/safety-constants");
  for (const s of m.SAFETY_SEVERITIES) {
    assert.ok(m.SAFETY_SEVERITY_LABEL[s]);
    assert.ok(m.SAFETY_SEVERITY_TONE[s]);
  }
  for (const c of m.SAFETY_CATEGORIES) {
    assert.ok(m.SAFETY_CATEGORY_LABEL[c]);
  }
  for (const s of m.SAFETY_STATUSES) {
    assert.ok(m.SAFETY_STATUS_LABEL[s]);
  }
});

test("ESCALATION_SEVERITIES is the severe+fatal subset", async () => {
  const m = await import("../src/lib/development/constants/safety-constants");
  assert.ok(m.ESCALATION_SEVERITIES.has("severe"));
  assert.ok(m.ESCALATION_SEVERITIES.has("fatal"));
  assert.ok(!m.ESCALATION_SEVERITIES.has("minor"));
  assert.ok(!m.ESCALATION_SEVERITIES.has("near_miss"));
});

// ----------------------------------------------------------------------------
// 4) Server-only guards on every new server file
// ----------------------------------------------------------------------------

const NEW_SERVER_FILES = [
  "src/lib/development/server/vendors.ts",
  "src/lib/development/server/vendor-actions.ts",
  "src/lib/development/server/site-reports.ts",
  "src/lib/development/server/site-report-actions.ts",
  "src/lib/development/server/materials.ts",
  "src/lib/development/server/material-actions.ts",
  "src/lib/development/server/safety.ts",
  "src/lib/development/server/safety-actions.ts",
  "src/lib/development/server/site-finance-bridge.ts",
];

test("every new 2.4 server file has a server-only guard", () => {
  for (const rel of NEW_SERVER_FILES) {
    assert.ok(exists(rel), `${rel} must exist`);
    const src = read(rel);
    assert.match(src, /^(import "server-only";|"use server";)/m, `${rel} missing server-only`);
  }
});

// ----------------------------------------------------------------------------
// 5) Action transactionality
// ----------------------------------------------------------------------------

test("createSiteReport wraps zones + workforce in db.transaction (atomic)", () => {
  const src = read("src/lib/development/server/site-report-actions.ts");
  assert.match(src, /createSiteReport[\s\S]+?db\.transaction\(/);
});

test("recordMaterialConsumption wraps log + po_line update in db.transaction", () => {
  const src = read("src/lib/development/server/site-report-actions.ts");
  assert.match(src, /recordMaterialConsumption[\s\S]+?db\.transaction\(/);
});

test("createMaterialPO + recordMaterialDelivery wrap parent + lines in db.transaction", () => {
  const src = read("src/lib/development/server/material-actions.ts");
  assert.match(src, /createMaterialPO[\s\S]+?db\.transaction\(/);
  assert.match(src, /recordMaterialDelivery[\s\S]+?db\.transaction\(/);
});

test("createVendorEngagement wraps engagement insert + vendor stats update in db.transaction", () => {
  const src = read("src/lib/development/server/vendor-actions.ts");
  assert.match(src, /createVendorEngagement[\s\S]+?db\.transaction\(/);
});

test("recordMaterialDelivery recomputes PO status from line totals (atomic)", () => {
  const src = read("src/lib/development/server/material-actions.ts");
  // Must aggregate quantity_ordered vs quantity_delivered and set PO status
  assert.match(src, /sum\(quantity_ordered\)/);
  assert.match(src, /sum\(quantity_delivered\)/);
  assert.match(src, /fully_delivered/);
  assert.match(src, /partially_delivered/);
});

test("recordMaterialConsumption blocks over-consumption", () => {
  const src = read("src/lib/development/server/site-report-actions.ts");
  assert.match(src, /Cannot consume[\s\S]+?delivered-but-unconsumed/);
});

test("recordMaterialDelivery blocks over-delivery", () => {
  const src = read("src/lib/development/server/material-actions.ts");
  assert.match(src, /cannot deliver[\s\S]+?already/);
});

test("bridge actions are idempotent (check existing dev_transactions before inserting)", () => {
  const src = read("src/lib/development/server/site-finance-bridge.ts");
  assert.match(src, /external_reference[\s\S]+?site_labor:/);
  assert.match(src, /external_reference[\s\S]+?material_delivery:/);
  assert.match(src, /already been bridged/);
  assert.match(src, /already bridged/);
});

test("bridge actions wrap in db.transaction (bank balance + tx insert atomic)", () => {
  const src = read("src/lib/development/server/site-finance-bridge.ts");
  assert.match(
    src,
    /convertSiteReportLaborToTransaction[\s\S]+?db\.transaction\(/,
  );
  assert.match(
    src,
    /convertMaterialDeliveryToTransaction[\s\S]+?db\.transaction\(/,
  );
});

// ----------------------------------------------------------------------------
// 6) Cron jobs
// ----------------------------------------------------------------------------

const CRON_RUNNERS = [
  "src/lib/development/server/cron/overdue-delivery-job.ts",
  "src/lib/development/server/cron/missing-site-report-job.ts",
  "src/lib/development/server/cron/safety-escalation-job.ts",
];

test("all 3 new cron job runner files exist", () => {
  for (const rel of CRON_RUNNERS) {
    assert.ok(exists(rel), `${rel} missing`);
  }
});

test("all 3 new cron HTTP routes exist", () => {
  for (const rel of [
    "src/app/api/cron/dev-os-overdue-delivery/route.ts",
    "src/app/api/cron/dev-os-missing-site-report/route.ts",
    "src/app/api/cron/dev-os-safety-escalation/route.ts",
  ]) {
    assert.ok(exists(rel), `${rel} missing`);
    const src = read(rel);
    assert.match(src, /handleCronJobRequest/);
  }
});

test("dispatcher registers all 3 new job keys", () => {
  const src = read("src/features/jobs/actions.ts");
  for (const key of [
    "dev_os_overdue_delivery",
    "dev_os_missing_site_report",
    "dev_os_safety_escalation",
  ]) {
    assert.ok(src.includes(`"${key}"`), `dispatcher missing key ${key}`);
  }
});

test("cron index re-exports all 3 new runners", () => {
  const src = read("src/lib/development/server/cron/index.ts");
  for (const name of [
    "runDevOsOverdueDelivery",
    "runDevOsMissingSiteReport",
    "runDevOsSafetyEscalation",
  ]) {
    assert.match(src, new RegExp(`export \\{ ${name} \\}`));
  }
});

test("overdue-delivery cron enforces 24h cooldown via delivery_log dedup", () => {
  const src = read("src/lib/development/server/cron/overdue-delivery-job.ts");
  assert.match(src, /COOLDOWN_HOURS = 24/);
  assert.match(src, /dev_notification_delivery_log[\s\S]+?material_delivery_overdue/);
});

test("missing-site-report cron filters to active projects (14d activity)", () => {
  const src = read(
    "src/lib/development/server/cron/missing-site-report-job.ts",
  );
  assert.match(src, /vendor_engagements[\s\S]+?status = 'active'/);
  assert.match(src, /report_date >= /);
});

test("safety-escalation cron only walks open severe/fatal >24h", () => {
  const src = read("src/lib/development/server/cron/safety-escalation-job.ts");
  assert.match(src, /status = 'open'/);
  assert.match(src, /severity IN \('severe','fatal'\)/);
  assert.match(src, /created_at <= /);
});

// ----------------------------------------------------------------------------
// 7) UI routes
// ----------------------------------------------------------------------------

const UI_ROUTES = [
  "src/app/(development-app)/development-os/vendors/page.tsx",
  "src/app/(development-app)/development-os/vendors/[code]/page.tsx",
  "src/app/(development-app)/development-os/site-reports/page.tsx",
  "src/app/(development-app)/development-os/site-reports/[id]/page.tsx",
  "src/app/(development-app)/development-os/materials/page.tsx",
  "src/app/(development-app)/development-os/materials/[poCode]/page.tsx",
  "src/app/(development-app)/development-os/materials/deliveries/page.tsx",
  "src/app/(development-app)/development-os/safety/page.tsx",
];

test("all 8 internal Stage 2.4 UI routes exist", () => {
  for (const rel of UI_ROUTES) {
    assert.ok(exists(rel), `${rel} missing`);
  }
});

test("UI list pages use safeQuery for resilience", () => {
  for (const rel of [
    "src/app/(development-app)/development-os/vendors/page.tsx",
    "src/app/(development-app)/development-os/site-reports/page.tsx",
    "src/app/(development-app)/development-os/materials/page.tsx",
    "src/app/(development-app)/development-os/materials/deliveries/page.tsx",
    "src/app/(development-app)/development-os/safety/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /safeQuery\(/, `${rel} should use safeQuery`);
  }
});

test("UI pages remain server components (no 'use client')", () => {
  for (const rel of UI_ROUTES) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /^"use client"/m,
      `${rel} must remain server component`,
    );
  }
});

test("site-reports page is no longer a placeholder (real query)", () => {
  const src = read(
    "src/app/(development-app)/development-os/site-reports/page.tsx",
  );
  assert.doesNotMatch(src, /ModulePlaceholder/);
  assert.match(src, /getSiteReports/);
});

// ----------------------------------------------------------------------------
// 8) Demo seed
// ----------------------------------------------------------------------------

test("seed adds Stage 2.4 vendors + engagements + zones + reports + materials + safety", () => {
  const src = read("scripts/seed-dev-os.mjs");
  for (const marker of [
    "Stage 2.4",
    "vendorSpecs",
    "engagementSpecs",
    "zoneSpecs",
    "REPORT_DAYS",
    "matPoSpecs",
    "deliverySpec",
    "incidentSpecs",
  ]) {
    assert.ok(src.includes(marker), `seed missing 2.4 marker: ${marker}`);
  }
});

test("seed uses ON CONFLICT on every 2.4 natural key", () => {
  const src = read("scripts/seed-dev-os.mjs");
  for (const target of [
    "ON CONFLICT (vendor_code)",
    "ON CONFLICT (engagement_code)",
    "ON CONFLICT (project_id, zone_code)",
    "ON CONFLICT (project_id, report_date)",
    "ON CONFLICT (po_code)",
    "ON CONFLICT (po_id, line_number)",
    "ON CONFLICT (delivery_code)",
    "ON CONFLICT (incident_code)",
  ]) {
    assert.ok(src.includes(target), `seed missing idempotency guard: ${target}`);
  }
});

test("seed verifies material PO/delivery reconciliation at the end", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /quantity_delivered reconciles to delivery_lines/);
});

test("seed includes one open severe incident for cron escalation test", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /Crane cable snapped/);
  assert.match(src, /severity: "severe"/);
});

test("seed includes one overdue PO (expected delivery in past, status='ordered') for cron test", () => {
  const src = read("scripts/seed-dev-os.mjs");
  // The marble countertops PO has expDel=2026-04-15, today is 2026-04-30 → overdue.
  assert.match(src, /Marble countertops/);
  assert.match(src, /intentionally past expected_delivery_date/);
});

// ----------------------------------------------------------------------------
// 9) Cron deployment docs
// ----------------------------------------------------------------------------

test("VERCEL-CRON-CHECKLIST lists all 3 new cron routes", () => {
  const src = read("docs/VERCEL-CRON-CHECKLIST.md");
  for (const path of [
    "/api/cron/dev-os-overdue-delivery",
    "/api/cron/dev-os-missing-site-report",
    "/api/cron/dev-os-safety-escalation",
  ]) {
    assert.ok(src.includes(path), `cron checklist missing: ${path}`);
  }
});

// ----------------------------------------------------------------------------
// 10) Pure-function regressions (must not break)
// ----------------------------------------------------------------------------

test("safeQuery still resolves to fallback on timeout (regression)", async () => {
  const { safeQuery } = await import("../src/lib/development/safe-query");
  const v = await safeQuery(
    "stuck",
    new Promise<number>(() => {
      // never resolves
    }),
    -1,
    50,
  );
  assert.equal(v, -1);
});

test("formatUsdMinor still formats correctly (regression)", async () => {
  const { formatUsdMinor } = await import(
    "../src/lib/development/constants/investor-constants"
  );
  assert.equal(formatUsdMinor(5_000_00n), "$5,000.00");
});
