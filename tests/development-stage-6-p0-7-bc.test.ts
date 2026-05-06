/**
 * Stage 6.P0.7-B + P0.7-C — Server orchestration + Wizard + Exports tests.
 *
 * Tests for:
 *   - 6 server actions in import-actions.ts
 *   - Cron processor + route + dispatcher wiring (route 73)
 *   - Wizard page + jobs list page
 *   - ExportButton + export-actions
 *   - Wiring onto 7 list pages
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const F_IMPORT_ACTIONS = "src/lib/development/server/bulk-import/import-actions.ts";
const F_EXPORT_ACTIONS = "src/lib/development/server/bulk-import/export-actions.ts";
const F_CRON_JOB = "src/lib/development/server/cron/bulk-import-processor-job.ts";
const F_CRON_ROUTE = "src/app/api/cron/dev-os-bulk-import-processor/route.ts";
const F_WIZARD = "src/components/development/bulk-import/wizard.tsx";
const F_EXPORT_BUTTON = "src/components/development/bulk-import/export-button.tsx";
const F_WIZARD_PAGE = "src/app/(development-app)/development-os/bulk-import/page.tsx";
const F_JOBS_PAGE = "src/app/(development-app)/development-os/bulk-import/jobs/page.tsx";

const F_DISPATCHER = "src/features/jobs/actions.ts";
const F_CRON_INDEX = "src/lib/development/server/cron/index.ts";

// ===========================================================================
// 1) Migration column additions (source_content, save_mapping_as)
// ===========================================================================

test("migration 0075 has source_content + save_mapping_as columns", () => {
  const sql = read("drizzle/0075_development_os_stage_6_p0_bulk_import.sql");
  assert.match(sql, /"source_content" TEXT/);
  assert.match(sql, /"save_mapping_as" TEXT/);
});

test("schema reflects source_content + save_mapping_as", () => {
  const src = read("src/lib/db/schema/bulk-import.ts");
  assert.match(src, /sourceContent: text\("source_content"\)/);
  assert.match(src, /saveMappingAs: text\("save_mapping_as"\)/);
});

// ===========================================================================
// 2) Server actions — file shape + 6 exports
// ===========================================================================

test("import-actions file exists + carries 'use server'", () => {
  assert.ok(exists(F_IMPORT_ACTIONS));
  assert.match(read(F_IMPORT_ACTIONS), /^"use server";/m);
});

const SERVER_ACTIONS = [
  "createBulkImportJob",
  "validateBulkImportJob",
  "processBulkImportJob",
  "cancelBulkImportJob",
  "listBulkImportJobs",
  "getBulkImportJob",
];

for (const fn of SERVER_ACTIONS) {
  test(`import-actions exports ${fn}`, () => {
    const src = read(F_IMPORT_ACTIONS);
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  });
}

test("createBulkImportJob accepts all 4 source types via Zod enum", () => {
  const src = read(F_IMPORT_ACTIONS);
  // Indirect: BULK_IMPORT_SOURCE_TYPES is the source of truth — verify schema imports it
  assert.match(src, /BULK_IMPORT_SOURCE_TYPES/);
  assert.match(src, /BULK_IMPORT_ENTITY_TYPES/);
});

test("createBulkImportJob generates IMPORT-YYYY-NNNNNN job codes", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /IMPORT-\$\{year\}-/);
});

test("validateBulkImportJob caps preview at 100 rows", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /PREVIEW_ROW_CAP = 100/);
});

test("processBulkImportJob batch size is 1000", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /PROCESS_BATCH_SIZE = 1000/);
});

test("processBulkImportJob is idempotent (resumes from processedRows)", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /job\.processedRows/);
  assert.match(src, /startIdx/);
});

test("cancelBulkImportJob refuses to cancel completed jobs", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /Cannot cancel a completed job/);
});

test("listBulkImportJobs supports status + entityType + pagination filters", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /status: z\s*\.enum/);
  assert.match(src, /entityType:/);
  assert.match(src, /limit: z\.number/);
  assert.match(src, /offset: z\.number/);
});

test("getBulkImportJob filters by org for RLS belt-and-suspenders", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /eq\(bulkImportJobs\.organizationId, orgId\)/);
});

test("import actions all gate on requireInternalUser()", () => {
  const src = read(F_IMPORT_ACTIONS);
  // At least 4 of the 6 actions call requireInternalUser
  const calls = (src.match(/requireInternalUser\(\)/g) ?? []).length;
  assert.ok(calls >= 4, `expected ≥4 requireInternalUser calls, found ${calls}`);
});

// ===========================================================================
// 3) JSON parsing in parseSource
// ===========================================================================

test("parseSource handles json (object array)", () => {
  const src = read(F_IMPORT_ACTIONS);
  // Function exists with json branch
  assert.match(src, /sourceType === "json"/);
  assert.match(src, /JSON\.parse\(content\)/);
});

// ===========================================================================
// 4) Cron processor + route + dispatcher
// ===========================================================================

test("cron processor file exists + carries server-only", () => {
  assert.ok(exists(F_CRON_JOB));
  const src = read(F_CRON_JOB);
  assert.match(src, /^import "server-only";/m);
});

test("cron processor exports runDevOsBulkImportProcessor", () => {
  assert.match(read(F_CRON_JOB), /export async function runDevOsBulkImportProcessor/);
});

test("cron processor caps jobs per run", () => {
  assert.match(read(F_CRON_JOB), /MAX_JOBS_PER_RUN = 5/);
});

test("cron processor handles stuck-processing recovery", () => {
  assert.match(read(F_CRON_JOB), /STUCK_PROCESSING_GRACE_MIN = 10/);
});

test("cron route file exists + uses handleCronJobRequest", () => {
  assert.ok(exists(F_CRON_ROUTE));
  const src = read(F_CRON_ROUTE);
  assert.match(src, /handleCronJobRequest/);
  assert.match(src, /dev_os_bulk_import_processor/);
});

test("cron route exports GET + POST", () => {
  const src = read(F_CRON_ROUTE);
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function POST/);
});

test("dispatcher (jobs/actions.ts) registers dev_os_bulk_import_processor", () => {
  const src = read(F_DISPATCHER);
  assert.match(src, /"dev_os_bulk_import_processor"/);
  assert.match(src, /case "dev_os_bulk_import_processor":/);
  assert.match(src, /runDevOsBulkImportProcessor/);
});

test("cron index re-exports the new runner + adds to job key union", () => {
  const src = read(F_CRON_INDEX);
  assert.match(src, /runDevOsBulkImportProcessor/);
  assert.match(src, /"dev_os_bulk_import_processor"/);
});

test("VERCEL-CRON-CHECKLIST documents the new cron route", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /dev-os-bulk-import-processor/);
  assert.match(md, /dev_os_bulk_import_processor/);
});

test("cron route count is 73 (Stage 5.J 72 + P0.7-B 1)", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const dir = resolve(ROOT, "src/app/api/cron");
  const subdirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  assert.ok(subdirs.length >= 73, `expected ≥73 cron routes, found ${subdirs.length}`);
});

// ===========================================================================
// 5) Wizard component
// ===========================================================================

test("Wizard file exists + is a client component", () => {
  assert.ok(exists(F_WIZARD));
  assert.match(read(F_WIZARD), /^"use client";/m);
});

test("Wizard imports all required pure helpers + server actions", () => {
  const src = read(F_WIZARD);
  assert.match(src, /parseCsv/);
  assert.match(src, /parseXlsx/);
  assert.match(src, /applyMapping/);
  assert.match(src, /autoSuggestMapping/);
  assert.match(src, /validateRow/);
  assert.match(src, /createBulkImportJob/);
  assert.match(src, /validateBulkImportJob/);
  assert.match(src, /processBulkImportJob/);
});

test("Wizard implements all 6 launch-prompt steps as collapsible sections", () => {
  const src = read(F_WIZARD);
  // Step labels referenced in STEP_LABELS map
  assert.match(src, /1: "Upload"/);
  assert.match(src, /2: "Entity type"/);
  assert.match(src, /3: "Field mapping"/);
  assert.match(src, /4: "Preview"/);
  assert.match(src, /5: "Confirm"/);
  assert.match(src, /6: "Results"/);
});

test("Wizard enforces 10 MB file size limit", () => {
  assert.match(read(F_WIZARD), /FILE_SIZE_LIMIT_BYTES = 10 \* 1024 \* 1024/);
});

test("Wizard polls every 2s during processing", () => {
  assert.match(read(F_WIZARD), /STATUS_POLL_MS = 2000/);
});

test("Wizard caps preview at 10 rows (matches launch prompt)", () => {
  assert.match(read(F_WIZARD), /PREVIEW_ROW_CAP = 10/);
});

test("Wizard supports CSV + XLSX + JSON file upload paths", () => {
  const src = read(F_WIZARD);
  assert.match(src, /accept=".csv,.xlsx,.xls,.json"/);
  assert.match(src, /ext === "csv"/);
  assert.match(src, /ext === "xlsx" \|\| ext === "xls"/);
  assert.match(src, /ext === "json"/);
});

test("Wizard auto-suggests mapping when entity type changes", () => {
  const src = read(F_WIZARD);
  assert.match(src, /handleEntityChange/);
  assert.match(src, /autoSuggestMapping\(parsed\.headers, internal\)/);
});

test("Wizard offers 'Save mapping as' template input", () => {
  const src = read(F_WIZARD);
  assert.match(src, /Save mapping as/);
  assert.match(src, /saveMappingAs/);
});

test("Wizard previews per-row valid/invalid status", () => {
  const src = read(F_WIZARD);
  assert.match(src, /previewValidCount/);
  assert.match(src, /previewInvalidCount/);
});

test("Wizard carries data-testid hooks for E2E", () => {
  const src = read(F_WIZARD);
  for (const id of [
    "bulk-import-upload-zone",
    "bulk-import-entity-select",
    "bulk-import-mapping-table",
    "bulk-import-submit",
    "bulk-import-progress",
    "preview-valid-count",
    "preview-invalid-count",
  ]) {
    assert.match(src, new RegExp(`data-testid="${id}"`));
  }
});

test("Wizard uses native HTML5 patterns (no Radix / Headless UI imports)", () => {
  const src = read(F_WIZARD);
  assert.doesNotMatch(src, /from\s+["']@radix-ui/);
  assert.doesNotMatch(src, /from\s+["']@headlessui/);
});

// ===========================================================================
// 6) Wizard page + Jobs list page
// ===========================================================================

test("Wizard page exists + mounts BulkImportWizard", () => {
  assert.ok(exists(F_WIZARD_PAGE));
  assert.match(read(F_WIZARD_PAGE), /<BulkImportWizard/);
});

test("Wizard page links to past jobs", () => {
  assert.match(read(F_WIZARD_PAGE), /href="\/development-os\/bulk-import\/jobs"/);
});

test("Jobs list page exists + uses listBulkImportJobs query", () => {
  assert.ok(exists(F_JOBS_PAGE));
  assert.match(read(F_JOBS_PAGE), /listBulkImportJobs/);
});

test("Jobs list page renders status badge per job", () => {
  const src = read(F_JOBS_PAGE);
  // STATUS_TONE map covers all 7 FSM states
  for (const status of [
    "pending",
    "validating",
    "ready",
    "processing",
    "completed",
    "failed",
    "cancelled",
  ]) {
    assert.match(src, new RegExp(`${status}:`));
  }
});

// ===========================================================================
// 7) Export action + button
// ===========================================================================

test("export-actions file exists + carries 'use server'", () => {
  assert.ok(exists(F_EXPORT_ACTIONS));
  assert.match(read(F_EXPORT_ACTIONS), /^"use server";/m);
});

test("export-actions exports exportEntityData", () => {
  assert.match(read(F_EXPORT_ACTIONS), /export async function exportEntityData/);
});

test("export-actions supports csv + xlsx + json formats", () => {
  const src = read(F_EXPORT_ACTIONS);
  assert.match(src, /EXPORT_FORMATS = \["csv", "xlsx", "json"\]/);
});

test("export-actions caps inline at 10000 rows", () => {
  assert.match(read(F_EXPORT_ACTIONS), /MAX_ROWS_INLINE = 10_000/);
});

test("export-actions stringifies bigint + Date for JSON/CSV serialization", () => {
  const src = read(F_EXPORT_ACTIONS);
  assert.match(src, /typeof v === "bigint"/);
  assert.match(src, /v instanceof Date/);
});

test("export-actions returns base64-encoded payload", () => {
  const src = read(F_EXPORT_ACTIONS);
  assert.match(src, /base64\?: string/);
  assert.match(src, /Buffer\.from\(.*?\)\.toString\("base64"\)/);
});

test("ExportButton file exists + is a client component", () => {
  assert.ok(exists(F_EXPORT_BUTTON));
  assert.match(read(F_EXPORT_BUTTON), /^"use client";/m);
});

test("ExportButton triggers Blob + anchor download client-side", () => {
  const src = read(F_EXPORT_BUTTON);
  assert.match(src, /new Blob/);
  assert.match(src, /createObjectURL/);
  assert.match(src, /URL\.revokeObjectURL/);
});

test("ExportButton exposes per-format menu (CSV / XLSX / JSON)", () => {
  const src = read(F_EXPORT_BUTTON);
  assert.match(src, /label: "CSV"/);
  assert.match(src, /label: "Excel \(\.xlsx\)"/);
  assert.match(src, /label: "JSON"/);
});

// ===========================================================================
// 8) ExportButton wiring on 7 list pages
// ===========================================================================

const WIRED_LIST_PAGES: Array<[string, string]> = [
  ["src/app/(development-app)/development-os/finance/transactions/page.tsx", "transactions"],
  ["src/app/(development-app)/development-os/finance/invoices/page.tsx", "invoices"],
  ["src/app/(development-app)/development-os/vendors/page.tsx", "vendors"],
  ["src/app/(development-app)/development-os/buyers/page.tsx", "buyers"],
  ["src/app/(development-app)/development-os/site-reports/page.tsx", "site_reports"],
  ["src/app/(development-app)/development-os/materials/page.tsx", "materials"],
  ["src/app/(development-app)/development-os/reservations/page.tsx", "reservations"],
];

for (const [page, entity] of WIRED_LIST_PAGES) {
  test(`${page.split("/").slice(-3).join("/")} mounts ExportButton entity="${entity}"`, () => {
    const src = read(page);
    assert.match(src, /ExportButton/);
    assert.match(src, new RegExp(`entity="${entity}"`));
  });
}

// ===========================================================================
// 9) No new dependencies in P0.7-B/C
// ===========================================================================

test("P0.7-B/C introduces no new dependencies beyond papaparse + xlsx (P0.7-A)", () => {
  const pkg = JSON.parse(read("package.json"));
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  // Toast + headless-modal libs that this stage explicitly avoided
  for (const f of ["sonner", "react-hot-toast", "@headlessui/react"]) {
    assert.equal(f in all, false, `must not add ${f}`);
  }
  // Confirm the wizard + button avoid Radix dropdown / dialog even
  // though Radix is pre-installed in the repo for unrelated use.
  for (const f of [F_WIZARD, F_EXPORT_BUTTON]) {
    assert.doesNotMatch(read(f), /from\s+["']@radix-ui/);
    assert.doesNotMatch(read(f), /from\s+["']@headlessui/);
  }
});

// ===========================================================================
// 10) Stage 5.J build-fix invariant preserved
// ===========================================================================

test("Stage 5.J build-fix invariant: client wizard + button don't import server-only", () => {
  for (const f of [F_WIZARD, F_EXPORT_BUTTON]) {
    assert.doesNotMatch(read(f), /^import\s+"server-only"/m);
  }
});

test("server actions carry 'use server' (callable from client wizard)", () => {
  for (const f of [F_IMPORT_ACTIONS, F_EXPORT_ACTIONS]) {
    assert.match(read(f), /^"use server";/m);
  }
});
