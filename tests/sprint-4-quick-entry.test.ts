/**
 * Sprint 4 — Quick-entry route + bulk action acceptance.
 *
 * Source-inspection tests only — the bulk action runs inside a DB
 * transaction and the route renders server components, so we verify
 * structural invariants rather than execute the live path.
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

const BULK = "src/lib/development/server/transaction-bulk-actions.ts";
const PAGE =
  "src/app/(development-app)/development-os/finance/transactions/quick-entry/page.tsx";
const FORM =
  "src/app/(development-app)/development-os/finance/transactions/quick-entry/quick-entry-form.tsx";

test("sprint-4 — bulk action ships at documented path", () => {
  assert.ok(existsSync(resolve(ROOT, BULK)));
  const src = read(BULK);
  assert.match(src, /^"use server";/m);
  assert.match(src, /export async function bulkRecordTransactions\(/);
});

test("sprint-4 — bulk action validates rows with Zod + caps at 500 per call", () => {
  const src = read(BULK);
  assert.match(src, /const bulkRowSchema = z\.object\(/);
  assert.match(src, /rows:\s*z\.array\(bulkRowSchema\)\.max\(500\)/);
});

test("sprint-4 — bulk action resolves category by displayName OR categoryCode", () => {
  const src = read(BULK);
  // The category lookup table populates from both name + code so
  // operators can paste either.
  assert.match(src, /c\.displayName\.trim\(\)\.toLowerCase\(\)/);
  assert.match(src, /c\.categoryCode\.trim\(\)\.toLowerCase\(\)/);
});

test("sprint-4 — bulk action resolves project by slug OR name", () => {
  const src = read(BULK);
  assert.match(src, /p\.slug\.trim\(\)\.toLowerCase\(\)/);
  assert.match(src, /p\.name\.trim\(\)\.toLowerCase\(\)/);
});

test("sprint-4 — bulk action returns per-row results with rowIndex + ok + error", () => {
  const src = read(BULK);
  assert.match(src, /export interface BulkRowResult/);
  assert.match(src, /rowIndex:\s*number/);
  assert.match(src, /ok:\s*boolean/);
  assert.match(src, /error\?:\s*string/);
});

test("sprint-4 — bulk action wraps recordTransaction per row (atomic per row)", () => {
  const src = read(BULK);
  assert.match(src, /await recordTransaction\(/);
  // Loop over parsed.rows.
  assert.match(src, /for \(let i = 0; i < parsed\.rows\.length; i\+\+\)/);
});

test("sprint-4 — bulk action surfaces category_not_found / project_not_found vocab", () => {
  const src = read(BULK);
  assert.match(src, /category_not_found/);
  assert.match(src, /project_not_found/);
  assert.match(src, /bank_account_not_found/);
});

test("sprint-4 — quick-entry route ships at documented path", () => {
  assert.ok(existsSync(resolve(ROOT, PAGE)));
  const src = read(PAGE);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  // Loads accounts + categories + projects in parallel.
  assert.match(src, /await Promise\.all\(\[/);
  // Mounts the client-island form.
  assert.match(src, /<QuickEntryForm/);
});

test("sprint-4 — quick-entry form is a client component using SpreadsheetView", () => {
  assert.ok(existsSync(resolve(ROOT, FORM)));
  const src = read(FORM);
  assert.match(src, /^"use client";/m);
  assert.match(src, /from "@\/components\/ui\/primitives\/spreadsheet-view"/);
  assert.match(src, /<SpreadsheetView/);
});

test("sprint-4 — quick-entry form exposes the 9-column spreadsheet contract", () => {
  const src = read(FORM);
  for (const key of [
    "date",
    "direction",
    "amountMajor",
    "currency",
    "categoryName",
    "projectCode",
    "counterpartyName",
    "description",
    "notes",
  ]) {
    assert.match(
      src,
      new RegExp(`key:\\s*"${key}"`),
      `quick-entry missing column key: ${key}`,
    );
  }
});

test("sprint-4 — amount conversion uses 6dp for USDT, 2dp otherwise", () => {
  const src = read(FORM);
  // USDT is 6-decimal (per recordTransaction); other currencies are 2dp.
  assert.match(src, /isUsdt\s*\?\s*1_000_000\s*:\s*100/);
});
