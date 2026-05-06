/**
 * Stage 2.4.B — UI polish: photo upload pipeline + create form pages +
 * project detail tabs + calendar view.
 *
 * Static-source tests — runtime upload flows live in the manual
 * checklist (DB-backed integration). The photo upload server action
 * is exercised here for input validation; actual Supabase storage
 * upload is tested via dry-run path (no service key needed).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ----------------------------------------------------------------------------
// 1) Photo upload pipeline — server action
// ----------------------------------------------------------------------------

const PHOTO_ACTIONS_PATH =
  "src/lib/development/server/photo-upload-actions.ts";

test("photo-upload-actions.ts exists with server-only guard", () => {
  assert.ok(exists(PHOTO_ACTIONS_PATH));
  const src = read(PHOTO_ACTIONS_PATH);
  assert.match(src, /^(import "server-only";|"use server";)/m);
});

test("uploadSiteReportPhoto + deleteSiteReportPhoto + getSiteReportPhotoUrl exported", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  for (const fn of [
    "uploadSiteReportPhoto",
    "deleteSiteReportPhoto",
    "getSiteReportPhotoUrl",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `missing ${fn}`,
    );
  }
});

test("photo upload validates MIME types (jpeg/png/webp/heic only)", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  assert.match(src, /image\/jpeg/);
  assert.match(src, /image\/png/);
  assert.match(src, /image\/webp/);
  assert.match(src, /image\/heic/);
  assert.match(src, /Unsupported MIME type/);
});

test("photo upload enforces 10MB max size", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  assert.match(src, /MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(src, /File too large/);
});

test("photo upload requires internal staff role", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  assert.match(src, /requireInternalUser\(\)/);
});

test("photo upload rejects reviewed/flagged reports", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  assert.match(src, /Cannot add photos to a \$\{report\.status\} report/);
  // Only draft/submitted accept new photos
  assert.match(src, /report\.status !== "draft" && report\.status !== "submitted"/);
});

test("photo upload validates zone belongs to same project", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  assert.match(src, /Zone \$\{[^}]*\} does not belong to project of report/);
});

test("photo upload uses dry-run when SUPABASE_SERVICE_ROLE_KEY absent", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  assert.match(src, /getSupabaseAdmin\(\)/);
  assert.match(src, /dryRun/);
  assert.match(src, /storage_bucket = 'dry_run'|"dry_run"/);
});

test("photo upload is atomic (documents + site_report_photos in one tx)", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  // The transaction wraps both inserts
  const fn = src.slice(src.indexOf("export async function uploadSiteReportPhoto"));
  const end = fn.indexOf("\n}\n");
  const body = fn.slice(0, end);
  assert.match(body, /db\.transaction\(/);
  assert.match(body, /\.insert\(documents\)/);
  assert.match(body, /\.insert\(siteReportPhotos\)/);
});

test("photo storage path follows {projectSlug}/{reportDate}/{uuid}.{ext} pattern", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  assert.match(src, /\$\{project\.slug\}\/\$\{String\(report\.reportDate\)\}\/\$\{photoUuid\}\.\$\{ext\}/);
});

test("photo deletion removes both rows + best-effort storage cleanup", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  const fn = src.slice(src.indexOf("export async function deleteSiteReportPhoto"));
  const end = fn.indexOf("\n}\n");
  const body = fn.slice(0, end);
  assert.match(body, /\.delete\(siteReportPhotos\)/);
  assert.match(body, /\.delete\(documents\)/);
  assert.match(body, /storage[\s\S]+?\.remove/);
});

test("getSiteReportPhotoUrl creates 1-hour signed URL", () => {
  const src = read(PHOTO_ACTIONS_PATH);
  assert.match(src, /createSignedUrl\([^,]+, 3600\)/);
});

// ----------------------------------------------------------------------------
// 2) Photo upload client component
// ----------------------------------------------------------------------------

test("PhotoUploadZone client component exists", () => {
  const path = "src/components/development/site-reports/photo-upload-zone.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^"use client";/m);
  assert.match(src, /export function PhotoUploadZone/);
});

test("PhotoUploadZone supports drag/drop + camera capture", () => {
  const src = read(
    "src/components/development/site-reports/photo-upload-zone.tsx",
  );
  assert.match(src, /onDrop=/);
  assert.match(src, /onDragOver=/);
  assert.match(src, /capture="environment"/); // mobile camera
});

test("PhotoUploadZone validates types + size client-side before upload", () => {
  const src = read(
    "src/components/development/site-reports/photo-upload-zone.tsx",
  );
  assert.match(src, /ALLOWED_TYPES = \["image\/jpeg"/);
  assert.match(src, /MAX_BYTES = 10 \* 1024 \* 1024/);
});

test("PhotoUploadZone POSTs to /api/development/site-reports/photos/upload", () => {
  const src = read(
    "src/components/development/site-reports/photo-upload-zone.tsx",
  );
  assert.match(
    src,
    /\/api\/development\/site-reports\/photos\/upload/,
  );
});

// ----------------------------------------------------------------------------
// 3) Photo upload bridge route
// ----------------------------------------------------------------------------

test("photo upload API route exists + uses Node runtime + force-dynamic", () => {
  const path = "src/app/api/development/site-reports/photos/upload/route.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export const runtime = "nodejs"/);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /uploadSiteReportPhoto/);
});

// ----------------------------------------------------------------------------
// 4) Photo gallery component
// ----------------------------------------------------------------------------

test("PhotoGallery server component exists with server-only guard", () => {
  const path = "src/components/development/site-reports/photo-gallery.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^(import "server-only";|"use server";)/m);
  assert.match(src, /export async function PhotoGallery/);
});

test("PhotoGallery groups photos by zone", () => {
  const src = read(
    "src/components/development/site-reports/photo-gallery.tsx",
  );
  assert.match(src, /grouped\.set\(key, arr\)/);
  assert.match(src, /No zone tag/);
});

test("PhotoGallery resolves signed URLs in parallel", () => {
  const src = read(
    "src/components/development/site-reports/photo-gallery.tsx",
  );
  assert.match(src, /Promise\.all\(/);
  assert.match(src, /getSiteReportPhotoUrl/);
});

test("PhotoGallery surfaces AI fields when populated (Stage 3 forward-compat)", () => {
  const src = read(
    "src/components/development/site-reports/photo-gallery.tsx",
  );
  assert.match(src, /aiAnalyzedAt/);
  assert.match(src, /AI analyzed/);
});

// ----------------------------------------------------------------------------
// 5) Site report create form (Step 3)
// ----------------------------------------------------------------------------

const SR_NEW_PATH =
  "src/app/(development-app)/development-os/site-reports/new/page.tsx";

test("site report create page exists", () => {
  assert.ok(exists(SR_NEW_PATH));
});

test("site report create uses createSiteReport server action", () => {
  const src = read(SR_NEW_PATH);
  assert.match(src, /createSiteReport\(/);
  assert.match(src, /"use server"/);
});

test("site report create has all 4 sections (basics + workforce + zones + summary)", () => {
  const src = read(SR_NEW_PATH);
  assert.match(src, /eyebrow="Step 1"/);
  assert.match(src, /eyebrow="Step 2"/);
  assert.match(src, /eyebrow="Step 3"/);
  assert.match(src, /eyebrow="Step 4"/);
});

test("site report create validates project+date+weather+zones+workforce inputs", () => {
  const src = read(SR_NEW_PATH);
  // Project required
  assert.match(src, /name="projectId"\s+defaultValue=\{[^}]*\}\s+required/);
  // Report date defaults to today and capped at today
  assert.match(src, /max=\{today\}/);
  // Workforce role + count fields
  assert.match(src, /name=\{`wf-\$\{i\}-role`\}/);
  assert.match(src, /name=\{`wf-\$\{i\}-count`\}/);
  // Per-zone fields
  assert.match(src, /name=\{`zone-\$\{z\.id\}-completed`\}/);
});

test("site report create skips empty workforce + zone rows", () => {
  const src = read(SR_NEW_PATH);
  assert.match(src, /if \(!role \|\| count === 0\) continue/);
  // Skip zones with all-empty fields
  assert.match(src, /Skip zones operator didn't fill anything for/);
});

test("site report list page links to /new for create CTA", () => {
  const src = read(
    "src/app/(development-app)/development-os/site-reports/page.tsx",
  );
  assert.match(src, /\/development-os\/site-reports\/new/);
});

// ----------------------------------------------------------------------------
// 6) Site report detail page — submit + review actions + photo upload
// ----------------------------------------------------------------------------

test("site report detail page wires submit + review + photo upload", () => {
  const src = read(
    "src/app/(development-app)/development-os/site-reports/[id]/page.tsx",
  );
  assert.match(src, /submitSiteReport/);
  assert.match(src, /reviewSiteReport/);
  assert.match(src, /PhotoUploadZone/);
  assert.match(src, /PhotoGallery/);
});

test("site report detail only shows submit button for draft status", () => {
  const src = read(
    "src/app/(development-app)/development-os/site-reports/[id]/page.tsx",
  );
  assert.match(src, /report\.status === "draft"/);
});

test("site report detail only shows review buttons for submitted status", () => {
  const src = read(
    "src/app/(development-app)/development-os/site-reports/[id]/page.tsx",
  );
  assert.match(src, /report\.status === "submitted"/);
  assert.match(src, /value="reviewed"/);
  assert.match(src, /value="flagged"/);
});

// ----------------------------------------------------------------------------
// 7) Other create pages (vendor, engagement, PO, delivery, safety)
// ----------------------------------------------------------------------------

const CREATE_PAGES = [
  "src/app/(development-app)/development-os/vendors/new/page.tsx",
  "src/app/(development-app)/development-os/vendors/[code]/engagements/new/page.tsx",
  "src/app/(development-app)/development-os/materials/new/page.tsx",
  "src/app/(development-app)/development-os/materials/[poCode]/deliveries/new/page.tsx",
  "src/app/(development-app)/development-os/safety/new/page.tsx",
];

test("all 5 create form pages exist", () => {
  for (const rel of CREATE_PAGES) {
    assert.ok(exists(rel), `${rel} missing`);
  }
});

test("each create form uses 'use server' action handler", () => {
  for (const rel of CREATE_PAGES) {
    const src = read(rel);
    assert.match(src, /"use server"/, `${rel} should have server action`);
  }
});

test("each create form handles error redirect on action failure", () => {
  for (const rel of CREATE_PAGES) {
    const src = read(rel);
    assert.match(src, /redirect\([\s\S]*error=/, `${rel} error redirect`);
  }
});

test("create forms that need to load lookup data gate DB explicitly", () => {
  // Forms that load lookups (engagement, PO, delivery, safety) need a DB
  // gate. The pure-write vendor form doesn't — its action throws on no DB,
  // and there's nothing to render until the action runs.
  for (const rel of [
    "src/app/(development-app)/development-os/vendors/[code]/engagements/new/page.tsx",
    "src/app/(development-app)/development-os/materials/new/page.tsx",
    "src/app/(development-app)/development-os/materials/[poCode]/deliveries/new/page.tsx",
    "src/app/(development-app)/development-os/safety/new/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /Database not configured/, `${rel} db gate`);
  }
});

test("safety create has fast-emergency UX (severity buttons + warning banner)", () => {
  const src = read(
    "src/app/(development-app)/development-os/safety/new/page.tsx",
  );
  // Severity radios styled as buttons
  assert.match(src, /name="severity"/);
  assert.match(src, /AlertTriangle/);
  // Severe/fatal warning banner about notification
  assert.match(src, /Severe \/ fatal incidents/);
  // Time defaults to NOW
  assert.match(src, /nowTime/);
});

test("PO create form computes totals server-side from line items", () => {
  const src = read(
    "src/app/(development-app)/development-os/materials/new/page.tsx",
  );
  assert.match(src, /Server computes/);
  // Multi-line input array up to MAX_LINES
  assert.match(src, /MAX_LINES = 8/);
  assert.match(src, /Empty lines are skipped/);
});

test("delivery create caps qty per line at remaining (ordered minus delivered)", () => {
  const src = read(
    "src/app/(development-app)/development-os/materials/[poCode]/deliveries/new/page.tsx",
  );
  assert.match(src, /max=\{remaining\}/);
  assert.match(src, /remaining \{remaining\.toFixed\(2\)\}/);
});

test("vendor create has Indonesian-friendly defaults (NPWP placeholder, +62 prefix)", () => {
  const src = read(
    "src/app/(development-app)/development-os/vendors/new/page.tsx",
  );
  assert.match(src, /01\.234\.567\.8-901\.000/);
  assert.match(src, /\+62 361/);
});

test("engagement create supports linking to dev_commitments_ledger", () => {
  const src = read(
    "src/app/(development-app)/development-os/vendors/[code]/engagements/new/page.tsx",
  );
  assert.match(src, /commitmentLedgerId/);
  assert.match(src, /devCommitmentsLedger/);
});

// ----------------------------------------------------------------------------
// 8) CTAs from list pages to new-create pages
// ----------------------------------------------------------------------------

test("vendor list links to /vendors/new", () => {
  const src = read(
    "src/app/(development-app)/development-os/vendors/page.tsx",
  );
  assert.match(src, /\/development-os\/vendors\/new/);
});

test("vendor detail links to /vendors/[code]/engagements/new", () => {
  const src = read(
    "src/app/(development-app)/development-os/vendors/[code]/page.tsx",
  );
  assert.match(src, /\/engagements\/new/);
});

test("materials list links to /materials/new", () => {
  const src = read(
    "src/app/(development-app)/development-os/materials/page.tsx",
  );
  assert.match(src, /\/development-os\/materials\/new/);
});

test("PO detail links to /materials/[poCode]/deliveries/new", () => {
  const src = read(
    "src/app/(development-app)/development-os/materials/[poCode]/page.tsx",
  );
  assert.match(src, /\/deliveries\/new/);
});

test("safety list links to /safety/new", () => {
  const src = read(
    "src/app/(development-app)/development-os/safety/page.tsx",
  );
  assert.match(src, /\/development-os\/safety\/new/);
});

// ----------------------------------------------------------------------------
// 9) Project detail tabs (Step 5)
// ----------------------------------------------------------------------------

test("project detail page imports Stage 2.4 query helpers", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/page.tsx",
  );
  for (const fn of [
    "getSiteReports",
    "getVendorEngagements",
    "getMaterialPurchaseOrders",
    "getSafetyIncidents",
  ]) {
    assert.match(src, new RegExp(fn), `project page missing import ${fn}`);
  }
});

test("project detail has all 4 new tabs (site-reports, vendors, materials, safety)", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/page.tsx",
  );
  for (const tab of [
    'value: "site-reports"',
    'value: "vendors"',
    'value: "materials"',
    'value: "safety"',
  ]) {
    assert.ok(src.includes(tab), `missing tab ${tab}`);
  }
});

test("project tabs use safeQuery for the 4 new fetchers", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/page.tsx",
  );
  assert.match(src, /safeQuery\(\s*"getSiteReports\(project\)"/);
  assert.match(src, /safeQuery\(\s*"getVendorEngagements\(project\)"/);
  assert.match(src, /safeQuery\(\s*"getMaterialPurchaseOrders\(project\)"/);
  assert.match(src, /safeQuery\(\s*"getSafetyIncidents\(project\)"/);
});

// ----------------------------------------------------------------------------
// 10) Calendar view (Step 6)
// ----------------------------------------------------------------------------

test("site-reports list supports calendar view via ?view=calendar", () => {
  const src = read(
    "src/app/(development-app)/development-os/site-reports/page.tsx",
  );
  assert.match(src, /sp\.view === "list"/);
  assert.match(src, /calendarGroups/);
  assert.match(src, /calendarDates/);
});

test("calendar view groups reports by date desc", () => {
  const src = read(
    "src/app/(development-app)/development-os/site-reports/page.tsx",
  );
  assert.match(src, /\.sort\(\)\.reverse\(\)/);
});

test("calendar view shows status badge per report card", () => {
  const src = read(
    "src/app/(development-app)/development-os/site-reports/page.tsx",
  );
  // Badge tone wired from report status
  assert.match(src, /tone=\{[\s\S]*?reviewed[\s\S]*?success/);
});

test("view toggle links cover both calendar + list", () => {
  const src = read(
    "src/app/(development-app)/development-os/site-reports/page.tsx",
  );
  assert.match(src, /\/development-os\/site-reports\?view=calendar/);
  assert.match(src, /\/development-os\/site-reports\?view=list/);
});

// ----------------------------------------------------------------------------
// 11) No new schema migrations (constraint check)
// ----------------------------------------------------------------------------

test("Stage 2.4.B introduces no migration 0041", () => {
  assert.ok(
    !exists("drizzle/0041_development_os_stage_2_4_b.sql"),
    "Stage 2.4.B must not introduce migration 0041 — UI-only checkpoint",
  );
});

// ----------------------------------------------------------------------------
// 12) Pure-function regressions
// ----------------------------------------------------------------------------

test("safeQuery still works (regression)", async () => {
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
  assert.equal(formatUsdMinor(7_500_00n), "$7,500.00");
});
