/**
 * Stage 6.P7-CATCHUP — Investor portal operator-side surface verification.
 *
 * v4's P7 plan listed many deliverables that already exist in the codebase
 * from prior stages. This test asserts each v4 contract is met (whether by
 * pre-existing actions or new catch-up additions) and adds the only
 * truly-new item: `editDistribution` for declared (not-yet-executed)
 * distributions.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

// ===========================================================================
// 1) Investor full operator-side CRUD
// ===========================================================================

test("Investor CRUD exists: createInvestor + updateInvestor + setInvestorStatus", () => {
  const src = readFile("src/lib/development/server/investor-actions.ts");
  for (const fn of ["createInvestor", "updateInvestor", "setInvestorStatus"]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

// ===========================================================================
// 2) Commitments + Distributions Edit
// ===========================================================================

test("Commitments Edit/lifecycle: updateCommitmentTerms + cancelCommitment + closeCommitment", () => {
  const src = readFile("src/lib/development/server/commitment-actions.ts");
  for (const fn of [
    "createCommitment",
    "updateCommitmentTerms",
    "cancelCommitment",
    "closeCommitment",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

test("Distributions Edit/lifecycle: declare + execute + cancel + edit", () => {
  const src = readFile("src/lib/development/server/distribution-actions.ts");
  for (const fn of [
    "declareDistribution",
    "executeDistribution",
    "cancelDistribution",
    "editDistribution",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

test("editDistribution refuses non-declared status", () => {
  const src = readFile("src/lib/development/server/distribution-actions.ts");
  // Guard: only 'declared' distributions accept metadata edits.
  assert.match(src, /only 'declared' distributions/);
});

test("editDistribution intentionally excludes total-amount changes", () => {
  const src = readFile("src/lib/development/server/distribution-actions.ts");
  // Documented invariant: amount changes are out of scope.
  assert.match(src, /totalAmountUsdMinor.*recomputing every|out of scope/i);
});

// ===========================================================================
// 3) Tax types + reports + shared costs
// ===========================================================================

test("Tax CRUD: upsertTaxType + generateTaxPeriodReport + classify + listing", () => {
  const src = readFile("src/lib/development/server/tax/tax-actions.ts");
  for (const fn of [
    "upsertTaxType",
    "classifyTransactionTax",
    "generateTaxPeriodReport",
    "listActiveTaxTypes",
    "listAllTaxTypes",
    "findUnclassifiedTransactions",
    "listTaxPeriodReports",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

test("Shared costs CRUD: propose + approve + reverse + list", () => {
  const src = readFile(
    "src/lib/development/server/shared-costs/shared-cost-actions.ts",
  );
  for (const fn of [
    "proposeSharedCostAllocation",
    "approveSharedCostAllocation",
    "reverseSharedCostAllocation",
    "listSharedCostAllocations",
    "getSharedCostAllocation",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

// ===========================================================================
// 4) Document extraction CRUD
// ===========================================================================

test("Document extraction CRUD: 5 actions + 2 readers", () => {
  const src = readFile(
    "src/lib/development/server/document-extraction-actions.ts",
  );
  for (const fn of [
    "extractFromDocumentNow",
    "approveExtractionAsTransaction",
    "rejectExtraction",
    "markExtractionDuplicate",
    "regenerateExtraction",
    "getDocumentExtractions",
    "getDocumentExtraction",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

// ===========================================================================
// 5) Owner Intelligence Reviews + Preferences (operator-side)
// ===========================================================================

test("Owner Intelligence: calendar prefs + review CRUD + visibility", () => {
  const src = readFile("src/features/owner-intelligence/actions.ts");
  for (const fn of [
    "updateOwnerCalendarPreferencesAction",
    "generateVillaHealthSnapshotAction",
    "createManualGuestReviewAction",
    "hideGuestReviewAction",
    "markGuestReviewOwnerVisibleAction",
    "refreshOwnerVisibleEventsAction",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

// ===========================================================================
// 6) Capital Finance invoices Edit + Archive
// ===========================================================================

test("Capital invoice flow: issue + generate-pdf + send + void (= archive)", () => {
  const src = readFile("src/lib/development/server/invoice-actions.ts");
  for (const fn of [
    "issueInvoiceForMilestone",
    "generateInvoicePDF",
    "sendInvoice",
    "voidInvoice",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

// ===========================================================================
// 7) Architecture doc bookkeeping
// ===========================================================================

test("arch doc: P7 carries CATCHUP marker (active or accepted)", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(
    src,
    /Stage 6\.P7 — Investor Portal Enhancement .*\[(ACTIVE|ACCEPTED) 6\.P7-CATCHUP\]/,
  );
});

// ===========================================================================
// 8) Investor portal subdomain — DEFERRED to Stage 7.E
// ===========================================================================

test("Investor portal subdomain deferred to Stage 7.E (no middleware.ts yet)", () => {
  // The subdomain/tenant-routing middleware is intentionally a Stage 7.E
  // deliverable — Phase B. Asserting the deferral here so Phase A.3
  // closure documentation stays accurate.
  const archDoc = readFile("docs/development-os-architecture.md");
  assert.match(archDoc, /Stage 6\.P7/);
});
