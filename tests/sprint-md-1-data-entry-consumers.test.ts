/**
 * Sprint MD-1 — Data-entry consumer acceptance.
 *
 * Source-inspection tests for the 4 new routes + their server
 * actions + the 3 cabinet-apex link updates. Tests assert on shape
 * — runtime persistence is exercised in the per-action unit tests
 * for the underlying recordTransaction / recordInventoryMovement /
 * addQuotation / selectQuotation primitives (all pre-existing).
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

const BOQ_BULK = "src/lib/development/server/boq/boq-bulk-actions.ts";
const BOQ_PAGE =
  "src/app/(development-app)/development-os/boq/quick-entry/page.tsx";
const BOQ_FORM =
  "src/app/(development-app)/development-os/boq/quick-entry/quick-entry-form.tsx";

const INV_BULK =
  "src/lib/development/server/inventory/inventory-bulk-actions.ts";
const INV_PAGE =
  "src/app/(development-app)/development-os/inventory/movements/quick-entry/page.tsx";
const INV_FORM =
  "src/app/(development-app)/development-os/inventory/movements/quick-entry/quick-entry-form.tsx";

const QUO_BULK =
  "src/lib/development/server/procurement/quotation-bulk-actions.ts";
const QUO_PAGE =
  "src/app/(development-app)/development-os/procurement/quotations/import/page.tsx";
const QUO_WIZARD =
  "src/app/(development-app)/development-os/procurement/quotations/import/import-wizard.tsx";

const MATRIX_QUERIES =
  "src/lib/development/server/procurement/quotation-matrix-queries.ts";
const MATRIX_ACTIONS =
  "src/lib/development/server/procurement/quotation-comparison-actions.ts";
const MATRIX_ISLAND =
  "src/app/(development-app)/development-os/procurement/quotation-comparison/_matrix-island.tsx";
const COMPARISON_PAGE =
  "src/app/(development-app)/development-os/procurement/quotation-comparison/page.tsx";

const QS_APEX =
  "src/app/(development-app)/development-os/cabinets/qs/page.tsx";
const WAREHOUSE_APEX =
  "src/app/(development-app)/development-os/cabinets/warehouse-manager/page.tsx";
const PROCUREMENT_APEX =
  "src/app/(development-app)/development-os/cabinets/procurement-manager/page.tsx";

// ============================================================================
// Task 1 — BoQ quick-entry
// ============================================================================

test("md-1 — bulkInsertBoqLines server action ships with documented shape", () => {
  assert.ok(exists(BOQ_BULK));
  const src = read(BOQ_BULK);
  assert.match(src, /^"use server"/m);
  assert.match(src, /export async function bulkInsertBoqLines/);
  // Per-row schema mirrors the Sprint-4 BulkRowResult contract.
  for (const f of [
    "sectionCode",
    "itemCode",
    "description",
    "quantity",
    "unitOfMeasure",
    "unitRateMajor",
    "categoryName",
    "supplierHint",
  ]) {
    assert.match(src, new RegExp(`\\b${f}\\b`));
  }
  // Catalog pre-loaded — case-insensitive resolution.
  assert.match(src, /sectionByCode/);
  assert.match(src, /categoryByName/);
  // Error-row pattern mirrors bulkRecordTransactions.
  assert.match(src, /section_not_found/);
  assert.match(src, /category_not_found/);
});

test("md-1 — /boq/quick-entry page + form mount SpreadsheetView + bulkInsertBoqLines", () => {
  assert.ok(exists(BOQ_PAGE));
  assert.ok(exists(BOQ_FORM));
  const page = read(BOQ_PAGE);
  const form = read(BOQ_FORM);
  assert.match(page, /<BoqQuickEntryForm/);
  assert.match(form, /<SpreadsheetView/);
  assert.match(form, /bulkInsertBoqLines/);
  // The 8 documented columns.
  for (const k of [
    "sectionCode",
    "itemCode",
    "description",
    "unit",
    "quantity",
    "unitRate",
    "category",
    "supplier",
  ]) {
    assert.match(form, new RegExp(`key: "${k}"`));
  }
});

test("md-1 — QS cabinet apex links to /boq/quick-entry from quick-action strip", () => {
  const src = read(QS_APEX);
  assert.match(src, /\/development-os\/boq\/quick-entry/);
});

// ============================================================================
// Task 2 — Stock movement quick-entry
// ============================================================================

test("md-1 — bulkInsertMovements server action ships with documented shape", () => {
  assert.ok(exists(INV_BULK));
  const src = read(INV_BULK);
  assert.match(src, /^"use server"/m);
  assert.match(src, /export async function bulkInsertMovements/);
  // Per-row fields per the spec.
  for (const f of [
    "itemSku",
    "movementType",
    "quantity",
    "fromLocation",
    "toLocation",
    "reference",
    "note",
  ]) {
    assert.match(src, new RegExp(`\\b${f}\\b`));
  }
  // Catalog pre-loaded; resolves both code + display_name.
  assert.match(src, /itemBySku/);
  assert.match(src, /locByCode/);
  // Error-row pattern.
  assert.match(src, /item_not_found/);
  assert.match(src, /from_location_not_found/);
});

test("md-1 — /inventory/movements/quick-entry page + form mount SpreadsheetView + bulkInsertMovements", () => {
  assert.ok(exists(INV_PAGE));
  assert.ok(exists(INV_FORM));
  const form = read(INV_FORM);
  assert.match(form, /<SpreadsheetView/);
  assert.match(form, /bulkInsertMovements/);
  // 8 columns: Date · Item · Type · Qty · From · To · Reference · Note.
  for (const k of [
    "date",
    "item",
    "movementType",
    "quantity",
    "fromLocation",
    "toLocation",
    "reference",
    "note",
  ]) {
    assert.match(form, new RegExp(`key: "${k}"`));
  }
});

test("md-1 — warehouse cabinet apex links to /inventory/movements/quick-entry", () => {
  const src = read(WAREHOUSE_APEX);
  assert.match(src, /\/development-os\/inventory\/movements\/quick-entry/);
  // Old "/movements/new" link replaced in the quick-action strip.
  assert.doesNotMatch(
    src,
    /href: "\/development-os\/inventory\/movements\/new"/,
  );
});

// ============================================================================
// Task 3 — Quotation import wizard
// ============================================================================

test("md-1 — bulkInsertQuotationLines server action groups rows by vendor + creates one quotation per (PR, vendor)", () => {
  assert.ok(exists(QUO_BULK));
  const src = read(QUO_BULK);
  assert.match(src, /^"use server"/m);
  assert.match(src, /export async function bulkInsertQuotationLines/);
  // Per-row schema.
  for (const f of [
    "vendorName",
    "itemDescription",
    "quantity",
    "unitOfMeasure",
    "unitPriceMajor",
    "leadTimeDays",
    "note",
  ]) {
    assert.match(src, new RegExp(`\\b${f}\\b`));
  }
  // prId is action-level, NOT per row — mirrors bulkRecordTransactions.
  assert.match(src, /prId: z\.string\(\)\.uuid\(\)/);
  // Vendor resolution is case-insensitive against legalName + vendorCode.
  assert.match(src, /vendorByName/);
  // Error pattern.
  assert.match(src, /vendor_not_found/);
  // Returns the count of distinct quotations materialised.
  assert.match(src, /quotationsCreatedCount/);
});

test("md-1 — /procurement/quotations/import ships 3-tab wizard (paste · xlsx · sheets-live)", () => {
  assert.ok(exists(QUO_PAGE));
  assert.ok(exists(QUO_WIZARD));
  const w = read(QUO_WIZARD);
  // Reuses Sprint-4 parsePaste + parseXlsx (domain-agnostic).
  assert.match(w, /from "@\/lib\/development\/server\/transaction-import"/);
  assert.match(w, /parsePaste/);
  assert.match(w, /parseXlsx/);
  // Auto-mapper covers the documented destination fields.
  for (const f of ["vendor", "item", "quantity", "unit", "price", "lead", "note"]) {
    assert.match(w, new RegExp(`"${f}"`));
  }
  // Three tabs.
  assert.match(w, /paste/);
  assert.match(w, /upload/);
  assert.match(w, /sheets-live/);
});

test("md-1 — procurement cabinet apex links to /quotations/import", () => {
  const src = read(PROCUREMENT_APEX);
  assert.match(src, /\/development-os\/procurement\/quotations\/import/);
});

// ============================================================================
// Task 4 — RfqMatrix consumer + createPoFromQuotationComparison
// ============================================================================

test("md-1 — quotation matrix data loader returns lines + vendors + cells", () => {
  assert.ok(exists(MATRIX_QUERIES));
  const src = read(MATRIX_QUERIES);
  assert.match(src, /export interface QuotationMatrixData/);
  assert.match(src, /lines:/);
  assert.match(src, /vendors:/);
  assert.match(src, /cellsByPrAndVendor/);
  assert.match(src, /export async function loadQuotationMatrix/);
});

test("md-1 — createPoFromQuotationComparison wraps selectQuotation per chosen vendor", () => {
  assert.ok(exists(MATRIX_ACTIONS));
  const src = read(MATRIX_ACTIONS);
  assert.match(src, /^"use server"/m);
  assert.match(src, /export async function createPoFromQuotationComparison/);
  assert.match(src, /supplierChoicesByPrId/);
  // Re-uses the existing atomic selectQuotation (PO creation).
  assert.match(src, /from "\.\/procurement-actions"/);
  assert.match(src, /selectQuotation/);
  // "already_selected" is treated as success-skipped, not as a hard error.
  assert.match(src, /already_selected/);
  assert.match(src, /skippedCount/);
});

test("md-1 — quotation-comparison page consumes <RfqMatrix> via the new client island", () => {
  const page = read(COMPARISON_PAGE);
  assert.match(page, /<QuotationMatrixIsland/);
  assert.match(page, /loadQuotationMatrix/);
  const island = read(MATRIX_ISLAND);
  assert.match(island, /^"use client"/m);
  assert.match(island, /<RfqMatrix/);
  assert.match(island, /createPoFromQuotationComparison/);
  // Operator can override the lowest-price default per row.
  assert.match(island, /type="radio"/);
});
