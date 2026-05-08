/**
 * Stage 6.P0.7-D + P0.8 — final P0 sub-checkpoint tests.
 *
 * Covers:
 *   - Per-entity insert dispatcher (D.1)
 *   - ExportButton wiring on 5 remaining list pages (D.2)
 *   - Audit trail emit on bulk import completion (D.4)
 *   - Google OAuth deferral doc (D.5)
 *   - Invoices status filter chips (P0.8.1)
 *   - Vendor detail with linked invoices (P0.8.2)
 *   - Cost category usage indicator + archive button (P0.8.3, P0.8.4)
 *   - Org settings page (P0.8.5)
 *   - Discount modal on contract detail (P0.8.6)
 *
 * Test infrastructure: pure node:test + grep against file contents
 * (no JSDOM, no React Testing Library — see existing test files for
 * the established pattern).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ===========================================================================
// File path constants — kept top-of-file so a rename surfaces fast.
// ===========================================================================

const F_DISPATCHER = "src/lib/development/server/bulk-import/entity-dispatcher.ts";
const F_IMPORT_ACTIONS = "src/lib/development/server/bulk-import/import-actions.ts";
const F_EXPORT_ACTIONS = "src/lib/development/server/bulk-import/export-actions.ts";

const F_PAGE_SALES = "src/app/(development-app)/development-os/sales/page.tsx";
const F_PAGE_INVESTORS = "src/app/(development-app)/development-os/investors/page.tsx";
const F_PAGE_QA_QC = "src/app/(development-app)/development-os/qa-qc/page.tsx";
const F_PAGE_SCHEDULE = "src/app/(development-app)/development-os/schedule/page.tsx";
const F_PAGE_INVENTORY = "src/app/(development-app)/development-os/inventory/items/page.tsx";

const F_PAGE_INVOICES = "src/app/(development-app)/development-os/finance/invoices/page.tsx";
const F_PAGE_VENDOR_DETAIL = "src/app/(development-app)/development-os/vendors/[code]/page.tsx";
const F_PAGE_CATEGORIES = "src/app/(development-app)/development-os/finance/categories/page.tsx";
const F_PAGE_ORG_LIST = "src/app/(development-app)/development-os/platform/organizations/page.tsx";
const F_PAGE_ORG_DETAIL = "src/app/(development-app)/development-os/platform/organizations/[code]/page.tsx";
const F_PAGE_CONTRACT_DETAIL = "src/app/(development-app)/development-os/contracts/[id]/page.tsx";

const F_COST_CATEGORIES_QUERY = "src/lib/development/server/cost-categories.ts";
const F_COST_CATEGORY_ARCHIVE = "src/components/development/finance/cost-category-archive-button.tsx";
const F_ORG_SETTINGS_FORM = "src/components/development/platform/organization-settings-form.tsx";

const F_DOC_GOOGLE_OAUTH = "docs/GOOGLE-OAUTH-SETUP.md";

// ===========================================================================
// P0.7-D.1 — Per-entity insert dispatcher
// ===========================================================================

test("dispatcher: file exists with use server directive", () => {
  assert.ok(exists(F_DISPATCHER), "entity-dispatcher.ts missing");
  const src = read(F_DISPATCHER);
  assert.match(src, /^"use server";/, "must declare use server (called from action context)");
});

test("dispatcher: exports dispatchEntityInserts as the public entry", () => {
  const src = read(F_DISPATCHER);
  assert.match(src, /export async function dispatchEntityInserts\(/);
});

test("dispatcher: handlers map covers all 13 BulkImportEntityType values", () => {
  const src = read(F_DISPATCHER);
  const expected = [
    "transactions",
    "vendors",
    "buyers",
    "investors",
    "leads",
    "site_reports",
    "tasks",
    "inventory_items",
    "qa_qc_issues",
    "materials",
    "invoices",
    "reservations",
    "contacts",
  ];
  for (const e of expected) {
    assert.match(
      src,
      new RegExp(`\\b${e}: \\(input\\) =>`),
      `handler for '${e}' missing`,
    );
  }
});

test("dispatcher: imports the existing entity actions (reuses, no re-implementing)", () => {
  const src = read(F_DISPATCHER);
  assert.match(src, /from "@\/lib\/development\/server\/transaction-actions"/);
  assert.match(src, /from "@\/lib\/development\/server\/vendor-actions"/);
  assert.match(src, /from "@\/lib\/development\/server\/buyers\/buyer-actions"/);
  assert.match(src, /from "@\/lib\/development\/server\/investor-actions"/);
  assert.match(src, /from "@\/lib\/development\/server\/lead-actions"/);
  assert.match(src, /from "@\/lib\/development\/server\/site-report-actions"/);
  assert.match(src, /from "@\/lib\/development\/server\/schedule\/schedule-actions"/);
  assert.match(src, /from "@\/lib\/development\/server\/inventory\/inventory-actions"/);
  assert.match(src, /from "@\/lib\/development\/server\/qa-qc\/qa-qc-actions"/);
});

test("dispatcher: leads handler uses FormData (createLead signature)", () => {
  const src = read(F_DISPATCHER);
  assert.match(src, /function rowToFormData\(row: Record/);
  assert.match(src, /leads: \(input\) =>[\s\S]*?rowToFormData\(row\)/);
});

test("dispatcher: unsupported-for-bulk entities return clear error per row", () => {
  const src = read(F_DISPATCHER);
  for (const e of ["materials", "invoices", "reservations", "contacts"]) {
    assert.match(
      src,
      new RegExp(`${e}: \\(input\\) =>[\\s\\S]*?ok: false[\\s\\S]*?[Bb]ulk import`),
      `${e} should return ok:false with explanation`,
    );
  }
});

test("dispatcher: skipInvalid honored — stops on failure when false", () => {
  const src = read(F_DISPATCHER);
  assert.match(src, /if \(!input\.options\.skipInvalid\) break/);
});

test("dispatcher: tracks createdIds + per-row errors with absolute rowIndex", () => {
  const src = read(F_DISPATCHER);
  assert.match(src, /createdIds: string\[\];/);
  assert.match(src, /rowIndex: number; field\?: string; message: string/);
  assert.match(src, /input\.rowIndexOffset \+ i/);
});

// ===========================================================================
// P0.7-D.1 (cont) — processBulkImportJob now actually inserts via dispatcher
// ===========================================================================

test("processBulkImportJob: imports + invokes dispatchEntityInserts", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /from "\.\/entity-dispatcher"/);
  assert.match(src, /dispatchEntityInserts\(/);
});

test("processBulkImportJob: uses validateRow per-row to keep rowIndex map stable", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /validateRow\(job\.entityType, mappedBatch\[i\]\)/);
});

test("processBulkImportJob: persists created_entity_ids back onto the job row", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /createdEntityIds: combinedCreatedIds/);
});

test("processBulkImportJob: passes skipInvalid:true (continue-on-error default)", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /skipInvalid: true/);
});

test("processBulkImportJob: error log entries have absolute rowIndex (offset by startIdx)", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /rowIndex: startIdx \+ validRowMap\[e\.rowIndex\]/);
});

// ===========================================================================
// P0.7-D.2 — ExportButton wiring on 5 remaining pages
// ===========================================================================

test("export wiring: sales/leads page imports + renders ExportButton", () => {
  const src = read(F_PAGE_SALES);
  assert.match(src, /import \{ ExportButton \} from "@\/components\/development\/bulk-import\/export-button"/);
  assert.match(src, /<ExportButton entity="leads" \/>/);
});

test("export wiring: investors page imports + renders ExportButton", () => {
  const src = read(F_PAGE_INVESTORS);
  assert.match(src, /import \{ ExportButton \}/);
  assert.match(src, /<ExportButton entity="investors" \/>/);
});

test("export wiring: qa-qc page imports + renders ExportButton", () => {
  const src = read(F_PAGE_QA_QC);
  assert.match(src, /import \{ ExportButton \}/);
  assert.match(src, /<ExportButton entity="qa_qc_issues" \/>/);
});

test("export wiring: schedule (tasks) page imports + renders ExportButton", () => {
  const src = read(F_PAGE_SCHEDULE);
  assert.match(src, /import \{ ExportButton \}/);
  assert.match(src, /<ExportButton entity="tasks" \/>/);
});

test("export wiring: inventory items page imports + renders ExportButton", () => {
  const src = read(F_PAGE_INVENTORY);
  assert.match(src, /import \{ ExportButton \}/);
  assert.match(src, /<ExportButton entity="inventory_items" \/>/);
});

test("export-actions: leads/investors/tasks/qa_qc_issues/inventory_items branches now functional (not empty stubs)", () => {
  const src = read(F_EXPORT_ACTIONS);
  assert.match(src, /case "leads": \{[\s\S]*?getLeadsPipeline/);
  assert.match(src, /case "investors": \{[\s\S]*?getInvestors/);
  assert.match(src, /case "tasks": \{[\s\S]*?listProjectTasks/);
  assert.match(src, /case "qa_qc_issues": \{[\s\S]*?listQaQcIssues/);
  assert.match(src, /case "inventory_items": \{[\s\S]*?listInventoryItems/);
});

// ===========================================================================
// P0.7-D.4 — Audit trail emit
// ===========================================================================

test("audit emit: import-actions imports recordAuditEvent", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /import \{ recordAuditEvent \} from "@\/features\/audit\/services"/);
});

test("audit emit: fires only on terminal transition (isDone)", () => {
  const src = read(F_IMPORT_ACTIONS);
  // The if-guard wrapping the audit call
  assert.match(src, /if \(isDone\) \{[\s\S]*?recordAuditEvent\(\{/);
});

test("audit emit: distinguishes completed vs failed actions", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /"bulk_import\.completed"/);
  assert.match(src, /"bulk_import\.failed"/);
});

test("audit emit: cron-safe (passes ipAddress/userAgent nulls explicitly)", () => {
  const src = read(F_IMPORT_ACTIONS);
  // Must not accidentally call headers() in cron context — the audit
  // service falls back to headers() only when these fields are undefined.
  assert.match(src, /ipAddress: null,[\s\S]{0,200}userAgent: null/);
});

test("audit emit: includes job + entity metadata for downstream filtering", () => {
  const src = read(F_IMPORT_ACTIONS);
  assert.match(src, /jobCode: job\.jobCode/);
  assert.match(src, /importedEntityType: job\.entityType/);
  assert.match(src, /createdEntityIdCount: combinedCreatedIds\.length/);
});

// ===========================================================================
// P0.7-D.5 — Google OAuth deferral doc
// ===========================================================================

test("google oauth: deferral doc exists at expected path", () => {
  assert.ok(exists(F_DOC_GOOGLE_OAUTH));
});

test("google oauth: doc explicitly states NOT IMPLEMENTED in P0", () => {
  const src = read(F_DOC_GOOGLE_OAUTH);
  assert.match(src, /Status: NOT IMPLEMENTED in P0/);
});

test("google oauth: doc references workaround (CSV download)", () => {
  const src = read(F_DOC_GOOGLE_OAUTH);
  assert.match(src, /Comma Separated Values \(\.csv\)/);
});

test("google oauth: doc names P5 as the landing stage", () => {
  const src = read(F_DOC_GOOGLE_OAUTH);
  assert.match(src, /Stage 6\.P5/);
  assert.match(src, /Productivity Tools/);
});

test("google oauth: doc names env vars the user will need to set", () => {
  const src = read(F_DOC_GOOGLE_OAUTH);
  assert.match(src, /GOOGLE_OAUTH_CLIENT_ID/);
  assert.match(src, /GOOGLE_OAUTH_CLIENT_SECRET/);
});

// ===========================================================================
// P0.8.1 — Invoices status filter strip
// ===========================================================================

test("invoices: status counts strip rendered above the form", () => {
  const src = read(F_PAGE_INVOICES);
  assert.match(src, /statusCounts/);
  assert.match(src, /data-testid={`invoice-status-chip-\$\{s\}`}/);
});

test("invoices: chip preserves type+project filters when navigating", () => {
  const src = read(F_PAGE_INVOICES);
  assert.match(src, /params\.set\("type", sp\.type\)/);
  assert.match(src, /params\.set\("project", sp\.project\)/);
});

test("invoices: clicking active chip clears that status (omits from params)", () => {
  const src = read(F_PAGE_INVOICES);
  // The chip only adds status to params when !isActive — clicking
  // again removes the filter.
  assert.match(src, /if \(!isActive\) params\.set\("status", s\)/);
});

// ===========================================================================
// P0.8.2 — Vendor detail linked invoices
// ===========================================================================

test("vendor detail: imports listInvoices + queries by vendorId", () => {
  const src = read(F_PAGE_VENDOR_DETAIL);
  assert.match(src, /import \{ listInvoices \}/);
  assert.match(src, /listInvoices\(\{ vendorId: vendor\.id/);
});

test("vendor detail: shows MetricCard with invoice count + outstanding total", () => {
  const src = read(F_PAGE_VENDOR_DETAIL);
  assert.match(src, /label="Invoices"/);
  assert.match(src, /outstandingMinor/);
});

test("vendor detail: linked invoices section + clickable invoice numbers", () => {
  const src = read(F_PAGE_VENDOR_DETAIL);
  assert.match(src, /Linked invoices \(\$\{vendorInvoices\.length\}\)/);
  assert.match(src, /href={`\/development-os\/finance\/invoices\/\$\{i\.id\}`}/);
});

// ===========================================================================
// P0.8.3 — Cost category usage indicator
// ===========================================================================

test("cost categories: getCostCategoryUsage query exported", () => {
  const src = read(F_COST_CATEGORIES_QUERY);
  assert.match(src, /export async function getCostCategoryUsage/);
});

test("cost categories: aggregates from devTransactions grouped by categoryId", () => {
  const src = read(F_COST_CATEGORIES_QUERY);
  assert.match(src, /devTransactions/);
  assert.match(src, /\.groupBy\(devTransactions\.categoryId\)/);
});

test("cost categories: usage rendered as Badge on the categories page", () => {
  const src = read(F_PAGE_CATEGORIES);
  assert.match(src, /import \{[\s\S]*?getCostCategoryUsage/);
  assert.match(src, /data-testid="cost-category-usage"/);
});

test("cost categories: shows 'unused' label when category has zero transactions", () => {
  const src = read(F_PAGE_CATEGORIES);
  assert.match(src, /unused/);
});

// ===========================================================================
// P0.8.4 — Per-row archive (cost categories)
// ===========================================================================

test("cost category archive: client component exists", () => {
  assert.ok(exists(F_COST_CATEGORY_ARCHIVE));
  const src = read(F_COST_CATEGORY_ARCHIVE);
  assert.match(src, /^"use client";/);
  assert.match(src, /export function CostCategoryArchiveButton/);
});

test("cost category archive: confirm dialog pattern (Stage 10.E.7 upgrade from 2-click)", () => {
  // Stage 10.E.7 replaced the bespoke `setConfirming(true)` two-click
  // confirm with the standard <ArchiveConfirmDialog> primitive for
  // consistency with the rest of the codebase. This guard now asserts
  // the dialog wrapper instead of the old state-based pattern.
  const src = read(F_COST_CATEGORY_ARCHIVE);
  assert.match(src, /<ArchiveConfirmDialog/);
  assert.match(src, /setConfirmOpen\(true\)/);
});

test("cost category archive: invokes deactivateCostCategory and refreshes", () => {
  const src = read(F_COST_CATEGORY_ARCHIVE);
  assert.match(src, /deactivateCostCategory\(id\)/);
  assert.match(src, /router\.refresh\(\)/);
});

test("cost category archive: hidden when category already inactive (no double-flip)", () => {
  const src = read(F_COST_CATEGORY_ARCHIVE);
  assert.match(src, /if \(!isActive\) return null/);
});

test("cost category archive: mounted on the categories page", () => {
  const src = read(F_PAGE_CATEGORIES);
  assert.match(src, /import \{ CostCategoryArchiveButton \}/);
  assert.match(src, /<CostCategoryArchiveButton/);
});

// ===========================================================================
// P0.8.5 — Org settings page (Tier 5 admin)
// ===========================================================================

test("org settings: dynamic detail page exists", () => {
  assert.ok(exists(F_PAGE_ORG_DETAIL));
});

test("org settings: list page makes org code clickable to detail", () => {
  const src = read(F_PAGE_ORG_LIST);
  assert.match(src, /href={`\/development-os\/platform\/organizations\/\$\{o\.organizationCode\}`}/);
});

test("org settings: detail page uses notFound on missing org (404 not 500)", () => {
  const src = read(F_PAGE_ORG_DETAIL);
  assert.match(src, /import \{ notFound \}/);
  assert.match(src, /notFound\(\)/);
});

test("org settings: client form exists with module toggles + archive flow", () => {
  assert.ok(exists(F_ORG_SETTINGS_FORM));
  const src = read(F_ORG_SETTINGS_FORM);
  assert.match(src, /^"use client";/);
  assert.match(src, /updateOrganizationModules/);
  assert.match(src, /archiveOrganization/);
});

test("org settings: archive requires reason text (3+ chars)", () => {
  const src = read(F_ORG_SETTINGS_FORM);
  assert.match(src, /archiveReason\.trim\(\)\.length < 3/);
});

test("org settings: detail page mounts the settings form", () => {
  const src = read(F_PAGE_ORG_DETAIL);
  assert.match(src, /import \{ OrganizationSettingsForm \}/);
  assert.match(src, /<OrganizationSettingsForm/);
});

// ===========================================================================
// P0.8.6 — Discount modal on contract detail
// ===========================================================================

test("contract detail: imports DiscountProposalModalForm", () => {
  const src = read(F_PAGE_CONTRACT_DETAIL);
  assert.match(src, /import \{ DiscountProposalModalForm \}/);
});

test("contract detail: gates modal behind authenticated app user", () => {
  const src = read(F_PAGE_CONTRACT_DETAIL);
  assert.match(src, /ctx\.appUser &&[\s\S]*?<DiscountProposalModalForm/);
});

test("contract detail: passes villaId, contactId, original price from group detail", () => {
  const src = read(F_PAGE_CONTRACT_DETAIL);
  assert.match(src, /villaId={detail\.villaId}/);
  assert.match(src, /contactId={detail\.contactId}/);
  assert.match(src, /originalPriceUsdMinor={detail\.totalContractValueUsdMinor}/);
});

// ===========================================================================
// Carry-forward sanity checks — items NOT shipped should be honestly absent
// ===========================================================================

test("carry-forward: ContractModalForm is NOT yet mounted on a reservation detail page (none exists)", () => {
  const detailPath = "src/app/(development-app)/development-os/reservations/[id]";
  // If a reservation detail page lands later, this test reminds us to
  // wire ContractModalForm there per P0.8.6 carry-forward.
  assert.equal(
    exists(detailPath),
    false,
    "reservation detail page now exists — wire ContractModalForm and remove this carry-forward marker",
  );
});

test("carry-forward: per-row archive shipped only for cost categories in P0", () => {
  // Other entity archive buttons would live alongside their list pages
  // under src/components/development/{entity}/. Until those server
  // actions exist, archive is not buildable.
  const others = [
    "src/components/development/vendors/vendor-archive-button.tsx",
    "src/components/development/buyers/buyer-archive-button.tsx",
    "src/components/development/investors/investor-archive-button.tsx",
  ];
  for (const path of others) {
    assert.equal(
      exists(path),
      false,
      `${path} now exists — update the carry-forward marker once the server-side action exists.`,
    );
  }
});
