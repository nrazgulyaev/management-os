/**
 * Sprint 4.5 — Bookkeeper polish acceptance.
 *
 * Source-inspection tests for the four deferred items that closed
 * this sprint: last-3 tax-assistant outputs on cabinet apex,
 * column-mapping override UI, template save/load actions, receipt
 * OCR via the AI image-attachment path.
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

const CFO_QUERIES =
  "src/lib/development/server/cabinets/cfo-cabinet-queries.ts";
const CFO_PAGE =
  "src/app/(development-app)/development-os/cabinets/cfo-accountant/page.tsx";
const WIZARD =
  "src/app/(development-app)/development-os/finance/transactions/import/import-wizard.tsx";
const TEMPLATE_ACTIONS =
  "src/lib/development/server/import-template-actions.ts";
const OCR_ACTION = "src/lib/development/server/receipt-ocr-actions.ts";
const EXTRACTOR =
  "src/app/(development-app)/development-os/finance/transactions/quick-entry/receipt-extractor.tsx";
const QUICK_ENTRY_FORM =
  "src/app/(development-app)/development-os/finance/transactions/quick-entry/quick-entry-form.tsx";

// ============================================================================
// Task 1 — Last-3 tax-assistant outputs on cabinet apex
// ============================================================================

test("sprint-4.5 — CfoCabinetData exposes recentTaxAssistantOutputs", () => {
  const src = read(CFO_QUERIES);
  assert.match(src, /recentTaxAssistantOutputs: CfoCabinetTaxAssistantOutput\[\]/);
  assert.match(src, /interface CfoCabinetTaxAssistantOutput/);
});

test("sprint-4.5 — CFO query selects LIMIT 3 tax-assistant rows", () => {
  const src = read(CFO_QUERIES);
  assert.match(
    src,
    /agent_key = 'tax_assistant'[\s\S]{0,200}ORDER BY created_at DESC LIMIT 3/,
  );
});

test("sprint-4.5 — CFO apex renders ink-deep cards for recent outputs", () => {
  const src = read(CFO_PAGE);
  assert.match(src, /recentTaxAssistantOutputs\.map/);
  // Cards use the ink-deep gradient + are wrapped in a 3-column grid.
  assert.match(src, /bg-gradient-ink-deep text-ink-inverse/);
});

// ============================================================================
// Task 2 — Column-mapping override UI
// ============================================================================

test("sprint-4.5 — ImportPreviewPanel derives applied from (parsed, mapping)", () => {
  const src = read(WIZARD);
  assert.match(src, /function ImportPreviewPanel\(/);
  assert.match(src, /React\.useState<ColumnMapping>/);
  assert.match(src, /React\.useMemo\([\s\S]{0,200}applyMapping\(parsed, mapping\)/);
});

test("sprint-4.5 — ColumnMapper enforces one-source-per-destination", () => {
  const src = read(WIZARD);
  assert.match(src, /function ColumnMapper\(/);
  // The mapper drops any other header claiming the destination
  // before assigning the new one — set-style uniqueness.
  assert.match(
    src,
    /draft\.destination_mapping\[h\] === next[\s\S]{0,200}delete draft\.destination_mapping\[h\]/,
  );
});

// ============================================================================
// Task 3 — Template save/load
// ============================================================================

test("sprint-4.5 — import-template-actions exports save/list/use/deactivate", () => {
  assert.ok(existsSync(resolve(ROOT, TEMPLATE_ACTIONS)));
  const src = read(TEMPLATE_ACTIONS);
  assert.match(src, /^"use server";/m);
  assert.match(src, /export async function saveImportTemplate\(/);
  assert.match(src, /export async function listImportTemplates\(/);
  assert.match(src, /export async function recordImportTemplateUse\(/);
  assert.match(src, /export async function deactivateImportTemplate\(/);
});

test("sprint-4.5 — saveImportTemplate auto-bumps version per (org, name)", () => {
  const src = read(TEMPLATE_ACTIONS);
  assert.match(src, /max\(importTemplates\.version\)/);
  assert.match(src, /nextVersion = \(highest\?\.v \?\? 0\) \+ 1/);
});

test("sprint-4.5 — listImportTemplates uses ROW_NUMBER to pick latest per name", () => {
  const src = read(TEMPLATE_ACTIONS);
  assert.match(
    src,
    /ROW_NUMBER\(\) OVER \(PARTITION BY name ORDER BY version DESC\)/,
  );
});

test("sprint-4.5 — wizard mounts TemplatePicker with save + apply controls", () => {
  const src = read(WIZARD);
  assert.match(src, /function TemplatePicker\(/);
  assert.match(src, /await saveImportTemplate\(/);
  assert.match(src, /void recordImportTemplateUse\(/);
});

// ============================================================================
// Task 4 — Receipt OCR
// ============================================================================

test("sprint-4.5 — receipt-ocr-actions ships at documented path with image-attachment support", () => {
  assert.ok(existsSync(resolve(ROOT, OCR_ACTION)));
  const src = read(OCR_ACTION);
  assert.match(src, /^"use server";/m);
  assert.match(src, /export async function extractReceipt\(/);
  // Uses the AIImageAttachment channel.
  assert.match(src, /images:\s*\[/);
  assert.match(src, /mediaType:/);
  assert.match(src, /imageBase64/);
});

test("sprint-4.5 — extractReceipt asks for STRICT JSON + handles markdown-fenced responses", () => {
  const src = read(OCR_ACTION);
  // Prompt requests strict JSON.
  assert.match(src, /STRICT JSON/);
  // Fence-stripping fallback.
  assert.match(src, /\^```/);
});

test("sprint-4.5 — extractReceipt validates accepted media types via Zod enum", () => {
  const src = read(OCR_ACTION);
  assert.match(src, /image\/jpeg/);
  assert.match(src, /image\/png/);
  assert.match(src, /image\/webp/);
  assert.match(src, /image\/gif/);
  assert.match(src, /z\.enum\(ACCEPTED_MEDIA_TYPES\)/);
});

test("sprint-4.5 — ReceiptExtractor client component ships + uses native camera capture", () => {
  assert.ok(existsSync(resolve(ROOT, EXTRACTOR)));
  const src = read(EXTRACTOR);
  assert.match(src, /^"use client";/m);
  assert.match(src, /export function ReceiptExtractor\(/);
  // capture="environment" → opens rear camera on iOS / Android.
  assert.match(src, /capture="environment"/);
  // Strips the data: URL prefix before posting to the action.
  assert.match(src, /\^data:\(image\\\//);
});

test("sprint-4.5 — quick-entry form mounts the ReceiptExtractor + handles confirm", () => {
  const src = read(QUICK_ENTRY_FORM);
  assert.match(src, /<ReceiptExtractor/);
  assert.match(src, /handleReceiptConfirm/);
  // Confirms run through the same bulkRecordTransactions path as the
  // SpreadsheetView commits (single-row batch).
  assert.match(
    src,
    /await bulkRecordTransactions\(\{[\s\S]{0,400}rows:\s*\[/,
  );
});
