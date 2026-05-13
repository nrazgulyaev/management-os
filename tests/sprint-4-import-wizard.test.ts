/**
 * Sprint 4 — Import wizard (paste + XLSX) acceptance.
 *
 * Behavioural tests for the pure parser/mapping library + source-
 * inspection on the migration, schema, route, and client wizard.
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

const PARSER = "src/lib/development/server/transaction-import.ts";
const MIGRATION = "drizzle/0097_import_templates.sql";
const SCHEMA = "src/lib/db/schema/import-templates.ts";
const WIZARD =
  "src/app/(development-app)/development-os/finance/transactions/import/import-wizard.tsx";
const PAGE =
  "src/app/(development-app)/development-os/finance/transactions/import/page.tsx";

// ============================================================================
// Pure parser — behavioural
// ============================================================================

test("sprint-4 import — parsePaste auto-detects TSV when tabs present", async () => {
  const { parsePaste } = await import(
    "../src/lib/development/server/transaction-import"
  );
  const raw = "Date\tType\tUSD\n2026-04-12\tExpense\t1250";
  const parsed = parsePaste(raw);
  assert.deepEqual(parsed.headers, ["Date", "Type", "USD"]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]["USD"], "1250");
});

test("sprint-4 import — parsePaste auto-detects CSV when no tabs", async () => {
  const { parsePaste } = await import(
    "../src/lib/development/server/transaction-import"
  );
  const raw = `Date,Type,USD\n2026-04-12,Expense,1250\n2026-04-13,Income,2000`;
  const parsed = parsePaste(raw);
  assert.deepEqual(parsed.headers, ["Date", "Type", "USD"]);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[1]["Type"], "Income");
});

test("sprint-4 import — parsePaste handles quoted CSV with embedded commas", async () => {
  const { parsePaste } = await import(
    "../src/lib/development/server/transaction-import"
  );
  const raw = `Date,Description\n2026-04-12,"Cement, delivery"`;
  const parsed = parsePaste(raw);
  assert.equal(parsed.rows[0]["Description"], "Cement, delivery");
});

test("sprint-4 import — autoMapHeaders matches English + Russian headers", async () => {
  const { autoMapHeaders } = await import(
    "../src/lib/development/server/transaction-import"
  );
  const en = autoMapHeaders(["Date", "Type", "Amount", "Category", "Description"]);
  assert.equal(en.destination_mapping["Date"], "date");
  assert.equal(en.destination_mapping["Type"], "direction");
  assert.equal(en.destination_mapping["Amount"], "amountMajor");
  assert.equal(en.destination_mapping["Category"], "categoryName");
  assert.equal(en.destination_mapping["Description"], "description");

  const ru = autoMapHeaders(["Дата", "Тип", "Сумма", "Категория", "Описание"]);
  assert.equal(ru.destination_mapping["Дата"], "date");
  assert.equal(ru.destination_mapping["Тип"], "direction");
  assert.equal(ru.destination_mapping["Сумма"], "amountMajor");
  assert.equal(ru.destination_mapping["Категория"], "categoryName");
  assert.equal(ru.destination_mapping["Описание"], "description");
});

test("sprint-4 import — applyMapping projects rows + flags warnings", async () => {
  const { parsePaste, autoMapHeaders, applyMapping } = await import(
    "../src/lib/development/server/transaction-import"
  );
  const raw =
    "Date\tType\tAmount\tCategory\tDescription\n" +
    "2026-04-12\tinflow\t1250\tConstruction\tCement\n" +
    "bad-date\tnonsense\tNaN\tConstruction\t\n"; // row 2 has multiple problems
  const parsed = parsePaste(raw);
  const mapping = autoMapHeaders(parsed.headers);
  const applied = applyMapping(parsed, mapping);
  assert.equal(applied.length, 2);
  assert.equal(applied[0].row.date, "2026-04-12");
  assert.equal(applied[0].warnings.length, 0);
  // Row 2: bad date + bad direction + bad amount + no description = 4 warnings.
  assert.ok(applied[1].warnings.length >= 3);
});

test("sprint-4 import — applyMapping honours constants + direction_map transforms", async () => {
  const { parsePaste, applyMapping } = await import(
    "../src/lib/development/server/transaction-import"
  );
  const raw = "Date\tType\tAmount\tDescription\n2026-04-12\tExpense\t1250\tCement";
  const parsed = parsePaste(raw);
  const applied = applyMapping(parsed, {
    destination_mapping: {
      Date: "date",
      Type: "direction",
      Amount: "amountMajor",
      Description: "description",
    },
    constants: { currency: "USD" },
    transform: { direction_map: { Expense: "outflow", Income: "inflow" } },
  });
  assert.equal(applied[0].row.direction, "outflow");
  assert.equal(applied[0].row.currency, "USD"); // from constants
});

// ============================================================================
// Migration + schema source-inspection
// ============================================================================

test("sprint-4 import — migration 0097 ships with import_templates table + RLS", () => {
  const src = read(MIGRATION);
  assert.match(src, /CREATE TABLE IF NOT EXISTS "import_templates"/);
  assert.match(src, /source_kind.*csv.*xlsx.*sheets_paste.*sheets_live/s);
  assert.match(src, /ENABLE ROW LEVEL SECURITY/);
  assert.match(src, /FORCE ROW LEVEL SECURITY/);
  // Standard org_isolation policy.
  assert.match(src, /CREATE POLICY org_isolation ON %I/);
});

test("sprint-4 import — Drizzle schema exposes importTemplates", () => {
  const src = read(SCHEMA);
  assert.match(src, /export const importTemplates = pgTable\(/);
  assert.match(src, /packagingKey|sourceKind/);
  assert.match(src, /columnMapping: jsonb/);
});

// ============================================================================
// Wizard + route source-inspection
// ============================================================================

test("sprint-4 import — wizard renders three tabs", () => {
  assert.ok(existsSync(resolve(ROOT, WIZARD)));
  const src = read(WIZARD);
  assert.match(src, /^"use client";/m);
  // Three tab keys.
  assert.match(src, /type Tab = "paste" \| "upload" \| "sheets-live"/);
  // Both live tabs render their respective parsers.
  assert.match(src, /parsePaste/);
  assert.match(src, /parseXlsx/);
  // Live Sheets is a placeholder (Sprint 4.5).
  assert.match(src, /Sprint 4\.5/);
});

test("sprint-4 import — wizard imports bulkRecordTransactions at commit", () => {
  const src = read(WIZARD);
  assert.match(src, /import \{ bulkRecordTransactions \}/);
  assert.match(src, /await bulkRecordTransactions\(/);
});

test("sprint-4 import — route file ships at documented path", () => {
  assert.ok(existsSync(resolve(ROOT, PAGE)));
  const src = read(PAGE);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /<ImportWizard/);
});
