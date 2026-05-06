/**
 * Stage 6.P0.7.A — Pure helper tests (sub-checkpoint A).
 *
 * Tests for:
 *   - csv-parser-helpers (parseCsv, tableToCsv)
 *   - xlsx-parser-helpers (parseXlsx, listSheetNames, tableToXlsx)
 *   - field-mapper-helpers (applyMapping, autoSuggestMapping, INTERNAL_FIELDS_PER_ENTITY)
 *   - validator-helpers (validateRow, validateBatch, SUPPORTED_IMPORT_ENTITIES)
 *   - migration 0075 file shape
 *   - schema exports
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseCsv,
  tableToCsv,
} from "../src/lib/development/server/bulk-import/csv-parser-helpers";
import {
  parseXlsx,
  listSheetNames,
  tableToXlsx,
} from "../src/lib/development/server/bulk-import/xlsx-parser-helpers";
import {
  applyMapping,
  autoSuggestMapping,
  INTERNAL_FIELDS_PER_ENTITY,
  type FieldMapping,
} from "../src/lib/development/server/bulk-import/field-mapper-helpers";
import {
  validateRow,
  validateBatch,
  SUPPORTED_IMPORT_ENTITIES,
} from "../src/lib/development/server/bulk-import/validator-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_75 = "drizzle/0075_development_os_stage_6_p0_bulk_import.sql";
const SCHEMA_FILE = "src/lib/db/schema/bulk-import.ts";

// ===========================================================================
// 1) Migration 0075 + schema
// ===========================================================================

test("migration 0075 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_75));
  const sql = read(MIG_75);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0075 creates bulk_import_jobs + oauth_connections", () => {
  const sql = read(MIG_75);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "bulk_import_jobs"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "oauth_connections"/);
});

test("migration 0075 has CHECK constraints for entity_type + source_type + status", () => {
  const sql = read(MIG_75);
  assert.match(sql, /entity_type" IN \(/);
  assert.match(sql, /source_type" IN \(/);
  assert.match(sql, /status" IN \(/);
});

test("migration 0075 enables RLS + FORCE RLS via Stage 5.J helper", () => {
  const sql = read(MIG_75);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /is_in_user_organization/);
});

test("migration 0075 oauth_connections has partial unique index (P0.2 partial-index lesson preserved)", () => {
  const sql = read(MIG_75);
  // Per the P0.2 ON CONFLICT lesson: partial uniques must repeat the WHERE.
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS\s+"oauth_connections_org_user_provider_account_unique"[\s\S]*?WHERE "account_email" IS NOT NULL/,
  );
});

test("schema file exports both tables + types + the 13 entity-type union", async () => {
  assert.ok(exists(SCHEMA_FILE));
  const m = await import("../src/lib/db/schema/bulk-import");
  assert.ok(m.bulkImportJobs);
  assert.ok(m.oauthConnections);
  assert.equal(m.BULK_IMPORT_ENTITY_TYPES.length, 13);
  assert.equal(m.BULK_IMPORT_SOURCE_TYPES.length, 4);
});

test("schema index re-exports bulk-import module", () => {
  assert.match(read("src/lib/db/schema/index.ts"), /export \* from "\.\/bulk-import"/);
});

// ===========================================================================
// 2) CSV parser
// ===========================================================================

test("parseCsv: empty input returns empty headers + rows", () => {
  const out = parseCsv("");
  assert.deepEqual(out.headers, []);
  assert.deepEqual(out.rows, []);
  assert.deepEqual(out.parseErrors, []);
});

test("parseCsv: simple 2-column 2-row table parses correctly", () => {
  const out = parseCsv("name,email\nAlice,alice@example.com\nBob,bob@example.com");
  assert.deepEqual(out.headers, ["name", "email"]);
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0].name, "Alice");
  assert.equal(out.rows[1].email, "bob@example.com");
});

test("parseCsv: handles quoted fields with embedded commas", () => {
  const out = parseCsv('a,b\n"hello, world","x"');
  assert.equal(out.rows[0].a, "hello, world");
  assert.equal(out.rows[0].b, "x");
});

test("parseCsv: handles UTF-8 BOM (Excel CSV export)", () => {
  const out = parseCsv("﻿name,email\nAlice,a@x.com");
  assert.deepEqual(out.headers, ["name", "email"]);
  assert.equal(out.rows[0].name, "Alice");
});

test("parseCsv: skips blank lines", () => {
  const out = parseCsv("a,b\n1,2\n\n\n3,4");
  assert.equal(out.rows.length, 2);
});

test("parseCsv: respects maxRows cap", () => {
  const lines = ["a"];
  for (let i = 0; i < 100; i++) lines.push(String(i));
  const out = parseCsv(lines.join("\n"), { maxRows: 10 });
  assert.equal(out.rows.length, 10);
});

test("parseCsv: trims field whitespace", () => {
  const out = parseCsv("name,email\n  Alice  ,  a@x.com  ");
  assert.equal(out.rows[0].name, "Alice");
  assert.equal(out.rows[0].email, "a@x.com");
});

test("tableToCsv: round-trip via parseCsv → tableToCsv produces equivalent rows", () => {
  const original = parseCsv("name,email\nAlice,a@x.com\nBob,b@x.com");
  const csv = tableToCsv(original);
  const reparsed = parseCsv(csv);
  assert.deepEqual(reparsed.headers, original.headers);
  assert.deepEqual(reparsed.rows, original.rows);
});

test("tableToCsv: stringifies object cells as JSON", () => {
  const csv = tableToCsv({
    headers: ["a"],
    rows: [{ a: { x: 1 } }],
  });
  assert.match(csv, /"\{""x"":1\}"/);
});

// ===========================================================================
// 3) XLSX parser (round-trip via tableToXlsx → parseXlsx)
// ===========================================================================

test("parseXlsx: empty bytes returns empty result without crashing", () => {
  // Build an empty workbook
  const empty = tableToXlsx({ headers: ["a"], rows: [] });
  const out = parseXlsx(empty);
  assert.deepEqual(out.headers, ["a"]);
  assert.deepEqual(out.rows, []);
});

test("parseXlsx: round-trips a simple 2-col 2-row table", () => {
  const bytes = tableToXlsx({
    headers: ["name", "email"],
    rows: [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ],
  });
  const out = parseXlsx(bytes);
  assert.deepEqual(out.headers, ["name", "email"]);
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0].name, "Alice");
});

test("listSheetNames: returns the configured sheet name", () => {
  const bytes = tableToXlsx({
    headers: ["a"],
    rows: [{ a: "1" }],
    sheetName: "MyData",
  });
  const names = listSheetNames(bytes);
  assert.deepEqual(names, ["MyData"]);
});

test("listSheetNames: malformed bytes don't throw (SheetJS coerces to a default sheet)", () => {
  // SheetJS is lenient — invalid bytes get coerced to a workbook with
  // ["Sheet1"]. The contract that matters is "doesn't crash the wizard
  // upload step"; downstream parseXlsx will just return empty rows.
  let threw = false;
  try {
    listSheetNames(new Uint8Array([0, 0, 0, 0]));
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
});

test("parseXlsx: targets a specific sheet by name when multi-sheet workbook", () => {
  const a = tableToXlsx({ headers: ["x"], rows: [{ x: "from-A" }], sheetName: "A" });
  // SheetJS write returns a single-sheet xlsx; multi-sheet round-trip needs
  // building one manually. We just confirm sheetName option is plumbed.
  const out = parseXlsx(a, { sheetName: "A" });
  assert.equal(out.rows[0].x, "from-A");
});

test("parseXlsx: invalid sheetName returns parseErrors", () => {
  const bytes = tableToXlsx({ headers: ["a"], rows: [{ a: "1" }] });
  const out = parseXlsx(bytes, { sheetName: "DoesNotExist" });
  assert.equal(out.headers.length, 0);
  assert.equal(out.parseErrors.length, 1);
  assert.match(out.parseErrors[0].message, /Sheet not found/);
});

test("parseXlsx: respects maxRows", () => {
  const rows: Array<Record<string, string>> = [];
  for (let i = 0; i < 50; i++) rows.push({ n: String(i) });
  const bytes = tableToXlsx({ headers: ["n"], rows });
  const out = parseXlsx(bytes, { maxRows: 10 });
  assert.equal(out.rows.length, 10);
});

// ===========================================================================
// 4) Field mapper
// ===========================================================================

test("applyMapping: drops external columns not in the mapping", () => {
  const row = { "Full Name": "Alice", Email: "a@x.com", "Junk Col": "drop me" };
  const mapping: FieldMapping = {
    "Full Name": { internalField: "fullName" },
    Email: { internalField: "email" },
  };
  const out = applyMapping(row, mapping);
  assert.equal(out.fullName, "Alice");
  assert.equal(out.email, "a@x.com");
  assert.equal((out as Record<string, unknown>)["Junk Col"], undefined);
});

test("applyMapping: missing external column → undefined unless defaultValue", () => {
  const mapping: FieldMapping = {
    "Full Name": { internalField: "fullName" },
    Status: { internalField: "status", defaultValue: "active" },
  };
  const out = applyMapping({ "Full Name": "Alice" }, mapping);
  assert.equal(out.fullName, "Alice");
  assert.equal(out.status, "active");
});

test("applyMapping: empty external value → defaultValue", () => {
  const mapping: FieldMapping = {
    Email: { internalField: "email", defaultValue: "noreply@x.com" },
  };
  const out = applyMapping({ Email: "" }, mapping);
  assert.equal(out.email, "noreply@x.com");
});

test("applyMapping: trim transform", () => {
  const out = applyMapping(
    { Email: "  alice@x.com  " },
    { Email: { internalField: "email", transform: "trim" } },
  );
  assert.equal(out.email, "alice@x.com");
});

test("applyMapping: lowercase transform", () => {
  const out = applyMapping(
    { Email: "Alice@Example.COM" },
    { Email: { internalField: "email", transform: "lowercase" } },
  );
  assert.equal(out.email, "alice@example.com");
});

test("applyMapping: uppercase transform", () => {
  const out = applyMapping(
    { Code: "abc123" },
    { Code: { internalField: "code", transform: "uppercase" } },
  );
  assert.equal(out.code, "ABC123");
});

test("autoSuggestMapping: exact normalized match", () => {
  const out = autoSuggestMapping(["full_name", "EMAIL"], ["fullName", "email"]);
  assert.equal(out["full_name"]?.internalField, "fullName");
  assert.equal(out["EMAIL"]?.internalField, "email");
});

test("autoSuggestMapping: snake/camel/spaces normalize away", () => {
  const out = autoSuggestMapping(
    ["Full Name", "phone-number"],
    ["fullName", "phoneNumber"],
  );
  assert.equal(out["Full Name"]?.internalField, "fullName");
  assert.equal(out["phone-number"]?.internalField, "phoneNumber");
});

test("autoSuggestMapping: substring fallback", () => {
  const out = autoSuggestMapping(["Customer Email Address"], ["email"]);
  assert.equal(out["Customer Email Address"]?.internalField, "email");
});

test("autoSuggestMapping: no match → entry omitted (not silently mismatched)", () => {
  const out = autoSuggestMapping(["WidgetCount"], ["fullName", "email"]);
  assert.equal(out["WidgetCount"], undefined);
});

test("INTERNAL_FIELDS_PER_ENTITY covers all 13 entity types", () => {
  const expected = [
    "transactions",
    "contacts",
    "vendors",
    "buyers",
    "investors",
    "materials",
    "inventory_items",
    "site_reports",
    "qa_qc_issues",
    "leads",
    "reservations",
    "invoices",
    "tasks",
  ];
  for (const e of expected) {
    assert.ok(
      Array.isArray(INTERNAL_FIELDS_PER_ENTITY[e]) &&
        INTERNAL_FIELDS_PER_ENTITY[e].length > 0,
      `missing internal-field list for: ${e}`,
    );
  }
});

// ===========================================================================
// 5) Row validator
// ===========================================================================

test("validateRow: unknown entity → error", () => {
  const r = validateRow("widgets", { x: "y" });
  assert.equal(r.ok, false);
  assert.match(r.errors?.[0].message ?? "", /Unknown entity type/);
});

test("validateRow: contacts requires either email or phone", () => {
  const r = validateRow("contacts", { fullName: "Alice" });
  assert.equal(r.ok, false);
  assert.match(JSON.stringify(r.errors), /Either email or phone/);
});

test("validateRow: contacts accepts email-only", () => {
  const r = validateRow("contacts", {
    fullName: "Alice",
    email: "alice@example.com",
  });
  assert.equal(r.ok, true);
  assert.equal((r.value as Record<string, unknown>).email, "alice@example.com");
});

test("validateRow: contacts accepts phone-only", () => {
  const r = validateRow("contacts", { fullName: "Alice", phone: "+62123" });
  assert.equal(r.ok, true);
});

test("validateRow: contacts rejects invalid email", () => {
  const r = validateRow("contacts", {
    fullName: "Alice",
    email: "not-an-email",
  });
  assert.equal(r.ok, false);
});

test("validateRow: vendors enforces vendor_code regex", () => {
  const r = validateRow("vendors", {
    vendorCode: "has spaces",
    legalName: "X",
    vendorType: "contractor",
  });
  assert.equal(r.ok, false);
});

test("validateRow: vendors accepts a valid row", () => {
  const r = validateRow("vendors", {
    vendorCode: "ACME_001",
    legalName: "ACME Construction",
    vendorType: "contractor",
  });
  assert.equal(r.ok, true);
});

test("validateRow: vendors rejects unknown vendor_type", () => {
  const r = validateRow("vendors", {
    vendorCode: "X1",
    legalName: "X",
    vendorType: "sorcerer",
  });
  assert.equal(r.ok, false);
});

test("validateRow: investors requires uuid-shaped fields not used at import; accepts minimal valid row", () => {
  const r = validateRow("investors", {
    investorCode: "ALICE_LP",
    investorType: "lp_private",
    legalName: "Alice Investor Holdings",
  });
  assert.equal(r.ok, true);
});

test("validateRow: site_reports requires projectId UUID + reportDate", () => {
  const bad = validateRow("site_reports", {
    projectId: "not-a-uuid",
    reportDate: "2026-05-06",
  });
  assert.equal(bad.ok, false);

  const good = validateRow("site_reports", {
    projectId: "11111111-1111-4111-8111-111111111101",
    reportDate: "2026-05-06",
  });
  assert.equal(good.ok, true);
});

test("validateRow: site_reports rejects malformed date", () => {
  const r = validateRow("site_reports", {
    projectId: "11111111-1111-4111-8111-111111111101",
    reportDate: "06/05/2026",
  });
  assert.equal(r.ok, false);
});

test("validateRow: tasks accepts minimal valid row", () => {
  const r = validateRow("tasks", {
    title: "Pour foundation",
    projectId: "11111111-1111-4111-8111-111111111101",
  });
  assert.equal(r.ok, true);
});

test("validateRow: passthrough entities (materials, inventory_items, etc.) accept any non-empty row", () => {
  const r = validateRow("materials", {
    materialName: "Cement",
    quantity: "100",
  });
  assert.equal(r.ok, true);
});

test("validateBatch: returns per-row error indices", () => {
  const result = validateBatch("contacts", [
    { fullName: "Alice", email: "alice@example.com" },
    { fullName: "Bob" }, // missing email + phone
    { fullName: "Charlie", phone: "+62456" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.validRows.length, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].rowIndex, 1);
});

test("validateBatch: empty input returns ok with no rows", () => {
  const result = validateBatch("contacts", []);
  assert.equal(result.ok, true);
  assert.equal(result.validRows.length, 0);
  assert.equal(result.errors.length, 0);
});

test("SUPPORTED_IMPORT_ENTITIES exports all 13 types", () => {
  const expected = new Set([
    "transactions",
    "contacts",
    "vendors",
    "buyers",
    "investors",
    "materials",
    "inventory_items",
    "site_reports",
    "qa_qc_issues",
    "leads",
    "reservations",
    "invoices",
    "tasks",
  ]);
  for (const e of SUPPORTED_IMPORT_ENTITIES) expected.delete(e);
  assert.equal(expected.size, 0, `missing import-validators for: ${[...expected].join(", ")}`);
});

// ===========================================================================
// 6) Helper module shape — pure, no server-only, no "use server"
// ===========================================================================

const HELPER_FILES = [
  "src/lib/development/server/bulk-import/csv-parser-helpers.ts",
  "src/lib/development/server/bulk-import/xlsx-parser-helpers.ts",
  "src/lib/development/server/bulk-import/field-mapper-helpers.ts",
  "src/lib/development/server/bulk-import/validator-helpers.ts",
];

for (const f of HELPER_FILES) {
  test(`${f.split("/").pop()} is a pure module (no server-only, no use server)`, () => {
    const src = read(f);
    assert.doesNotMatch(src, /^"use server"/m);
    assert.doesNotMatch(src, /^import\s+"server-only"/m);
  });
}

// ===========================================================================
// 7) New deps justified + present
// ===========================================================================

test("package.json includes papaparse + xlsx + @types/papaparse (P0.7 justified deps)", () => {
  const pkg = JSON.parse(read("package.json"));
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok("papaparse" in all, "papaparse not installed");
  assert.ok("xlsx" in all, "xlsx not installed");
  assert.ok("@types/papaparse" in all, "@types/papaparse not installed");
});
