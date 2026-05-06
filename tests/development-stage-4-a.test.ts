/**
 * Stage 4.A — Bookkeeping Foundation + Project Setup Critical Path.
 *
 * Closes the strategic-review gaps: land profile, permits, tax module,
 * invoice entity, shared-cost allocations, purchase request workflow.
 *
 * Mix of:
 *   - Runtime tests for the two pure helper modules:
 *     `allocation-helpers.ts` (sum-to-100 + rounding remainder folding)
 *     `approval-helpers.ts`   (threshold matrix lookup + role hierarchy)
 *   - Static-source tests for everything that imports `server-only`.
 *   - Migration shape tests (3 migrations, 17 new tables).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeAllocationAmounts,
  weightsToPercentages,
} from "../src/lib/development/server/shared-costs/allocation-helpers";
import {
  lookupRequiredApproval,
  isRoleSufficient,
  type ApprovalThresholdRow,
} from "../src/lib/development/server/procurement/approval-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ===========================================================================
// 1) Migrations 0045 / 0046 / 0047 — shape
// ===========================================================================

const MIG_0045 = "drizzle/0045_development_os_stage_4_a_1_project_setup.sql";
const MIG_0046 = "drizzle/0046_development_os_stage_4_a_2_financial_ops.sql";
const MIG_0047 = "drizzle/0047_development_os_stage_4_a_3_operational_workflows.sql";

test("migration 0045 file exists", () => {
  assert.ok(exists(MIG_0045));
});
test("migration 0046 file exists", () => {
  assert.ok(exists(MIG_0046));
});
test("migration 0047 file exists", () => {
  assert.ok(exists(MIG_0047));
});

test("all three Stage 4.A migrations wrap in BEGIN/COMMIT", () => {
  for (const m of [MIG_0045, MIG_0046, MIG_0047]) {
    const sql = read(m);
    assert.match(sql, /^BEGIN;/m, `${m} missing BEGIN`);
    assert.match(sql, /^COMMIT;/m, `${m} missing COMMIT`);
  }
});

test("migration 0045 creates land_profiles with acquisition_mode CHECK", () => {
  const sql = read(MIG_0045);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "land_profiles"/);
  assert.match(
    sql,
    /'leasehold', 'freehold', 'joint_venture', 'landowner_partnership',\s*\n\s*'nominee', 'revenue_share', 'custom'/,
  );
  assert.match(sql, /UNIQUE\s+REFERENCES "projects"|UNIQUE NOT NULL[\s\S]+?REFERENCES "projects"/);
});

test("migration 0045 creates land_payment_installments with status + UNIQUE(schedule, num)", () => {
  const sql = read(MIG_0045);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "land_payment_installments"/);
  assert.match(sql, /UNIQUE \("schedule_id", "installment_number"\)/);
  assert.match(sql, /'pending', 'paid', 'partial', 'overdue', 'cancelled'/);
});

test("migration 0045 creates project_permits with full status + type CHECKs", () => {
  const sql = read(MIG_0045);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "project_permits"/);
  // Status enumeration covers the full lifecycle.
  for (const s of [
    "planned",
    "preparing",
    "submitted",
    "under_review",
    "approved",
    "rejected",
    "expired",
    "renewed",
    "cancelled",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `permit status '${s}' missing`);
  }
});

test("migration 0045 RLS-protects all 6 new tables", () => {
  const sql = read(MIG_0045);
  for (const t of [
    "land_profiles",
    "land_payment_schedules",
    "land_payment_installments",
    "land_transaction_costs",
    "project_permits",
    "project_permit_documents",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

test("migration 0046 extends dev_transactions with tax fields", () => {
  const sql = read(MIG_0046);
  assert.match(sql, /ALTER TABLE "dev_transactions"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "tax_type_id"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "tax_amount_minor"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "tax_classification_status"/);
  assert.match(
    sql,
    /'unclassified', 'classified', 'reviewed', 'flagged_missing_doc', 'tax_exempt'/,
  );
});

test("migration 0046 creates dev_invoices with type CHECK + 4 invoice types", () => {
  const sql = read(MIG_0046);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "dev_invoices"/);
  assert.match(
    sql,
    /'payable', 'receivable', 'investor_call', 'internal'/,
  );
});

test("migration 0046 dev_invoices.outstanding_minor is GENERATED STORED", () => {
  const sql = read(MIG_0046);
  assert.match(
    sql,
    /"outstanding_minor" BIGINT[\s\S]+?GENERATED ALWAYS AS \("total_minor" - "paid_minor"\) STORED/,
  );
});

test("migration 0046 dev_invoice_lines.line_subtotal_minor is GENERATED STORED", () => {
  const sql = read(MIG_0046);
  assert.match(
    sql,
    /"line_subtotal_minor" BIGINT[\s\S]+?GENERATED ALWAYS AS[\s\S]+?STORED/,
  );
});

test("migration 0046 references villas (not units) — schema name preserved", () => {
  const sql = read(MIG_0046);
  // The schema's "units" are `villas` in this codebase.
  assert.match(sql, /REFERENCES "villas"/);
});

test("migration 0046 adds the deferred FK from land_payment_installments → dev_invoices", () => {
  const sql = read(MIG_0046);
  assert.match(
    sql,
    /ALTER TABLE "land_payment_installments"[\s\S]+?REFERENCES "dev_invoices"/,
  );
});

test("migration 0047 creates shared_cost_allocations + DB-enforced 100% sum trigger", () => {
  const sql = read(MIG_0047);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "shared_cost_allocations"/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION "check_shared_cost_allocation_sum"/);
  assert.match(sql, /must sum to exactly 100%%/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
});

test("migration 0047 namespaces purchase requests as dev_os_purchase_requests (avoids Mgmt OS collision)", () => {
  const sql = read(MIG_0047);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "dev_os_purchase_requests"/);
  assert.match(
    sql,
    /'draft', 'submitted', 'approved', 'quotations_in_progress',\s*\n\s*'quotation_selected', 'po_created', 'rejected', 'cancelled'/,
  );
});

test("migration 0047 enforces single-winner via partial unique on quotations", () => {
  const sql = read(MIG_0047);
  assert.match(
    sql,
    /UNIQUE INDEX IF NOT EXISTS "procurement_quotations_selected_unique"/,
  );
  assert.match(sql, /WHERE "status" = 'selected'/);
});

test("migration 0047 seeds default approval thresholds idempotently", () => {
  const sql = read(MIG_0047);
  assert.match(sql, /INSERT INTO "approval_thresholds"/);
  assert.match(sql, /WHERE NOT EXISTS \(/);
  // 9 default rows (4 PR tiers + 2 change_order + 1 distribution + 2 discount).
  for (const role of [
    "auto_approved",
    "project_manager",
    "director",
    "investor_approval",
    "reserved_matter",
  ]) {
    assert.ok(sql.includes(`'${role}'`), `seeded role '${role}' missing`);
  }
});

test("migration 0047 RLS-protects all 6 new tables", () => {
  const sql = read(MIG_0047);
  for (const t of [
    "shared_cost_allocations",
    "shared_cost_allocation_lines",
    "dev_os_purchase_requests",
    "procurement_quotations",
    "procurement_quotation_lines",
    "approval_thresholds",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

// ===========================================================================
// 2) Drizzle schemas exported correctly
// ===========================================================================

test("Drizzle schemas exist for all 6 Stage 4.A modules", () => {
  for (const f of [
    "src/lib/db/schema/land.ts",
    "src/lib/db/schema/permits.ts",
    "src/lib/db/schema/tax.ts",
    "src/lib/db/schema/invoices.ts",
    "src/lib/db/schema/shared-costs.ts",
    "src/lib/db/schema/procurement.ts",
  ]) {
    assert.ok(exists(f), `${f} missing`);
  }
});

test("Drizzle schema index re-exports all 6 new modules", () => {
  const src = read("src/lib/db/schema/index.ts");
  for (const m of [
    "land",
    "permits",
    "tax",
    "invoices",
    "shared-costs",
    "procurement",
  ]) {
    assert.match(src, new RegExp(`from "\\./${m}"`));
  }
});

test("dev_transactions schema gains tax fields (taxTypeId, taxClassificationStatus, etc.)", () => {
  const src = read("src/lib/db/schema/dev-finance.ts");
  assert.match(src, /taxTypeId: uuid\("tax_type_id"\)/);
  assert.match(src, /taxAmountMinor: bigint\("tax_amount_minor"/);
  assert.match(
    src,
    /taxClassificationStatus: text\("tax_classification_status"\)/,
  );
});

// ===========================================================================
// 3) Allocation helper — RUNTIME tests
//
// computeAllocationAmounts is the core math for shared cost splits.
// Every rail (sum-to-100, rounding remainder folding, edge cases) needs
// an airtight unit test.
// ===========================================================================

test("allocation: 50/50 split exactly halves the source", () => {
  const out = computeAllocationAmounts(10000n, [
    { projectId: "p1", percentage: 50 },
    { projectId: "p2", percentage: 50 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].amountMinor + out[1].amountMinor, 10000n);
  assert.equal(out[0].amountMinor, 5000n);
});

test("allocation: 45/30/25 split sums exactly to source (rounding folded)", () => {
  const out = computeAllocationAmounts(100000n, [
    { projectId: "p1", percentage: 45 },
    { projectId: "p2", percentage: 30 },
    { projectId: "p3", percentage: 25 },
  ]);
  const sum = out.reduce((s, l) => s + l.amountMinor, 0n);
  assert.equal(sum, 100000n);
});

test("allocation: prime-divisor rounding remainder folds into largest line", () => {
  // 7 split 60/40 → 4.2 + 2.8 → rounds to 4 + 3 = 7. Largest line gets the remainder.
  const out = computeAllocationAmounts(7n, [
    { projectId: "small", percentage: 40 },
    { projectId: "big", percentage: 60 },
  ]);
  const sum = out.reduce((s, l) => s + l.amountMinor, 0n);
  assert.equal(sum, 7n);
  // Big line (60%) should get more than the small line.
  const big = out.find((l) => l.projectId === "big")!;
  const small = out.find((l) => l.projectId === "small")!;
  assert.ok(big.amountMinor >= small.amountMinor);
});

test("allocation: throws when percentages don't sum to 100", () => {
  assert.throws(
    () =>
      computeAllocationAmounts(100n, [
        { projectId: "p1", percentage: 50 },
        { projectId: "p2", percentage: 30 },
      ]),
    /must sum to 100%/,
  );
});

test("allocation: throws when percentage <= 0 or > 100", () => {
  assert.throws(
    () =>
      computeAllocationAmounts(100n, [
        { projectId: "p1", percentage: 0 },
        { projectId: "p2", percentage: 100 },
      ]),
    /percentage must be in/,
  );
  assert.throws(
    () =>
      computeAllocationAmounts(100n, [
        { projectId: "p1", percentage: -10 },
        { projectId: "p2", percentage: 110 },
      ]),
    /percentage must be in/,
  );
});

test("allocation: throws when source amount is negative", () => {
  assert.throws(
    () =>
      computeAllocationAmounts(-100n, [
        { projectId: "p1", percentage: 100 },
      ]),
    /must be ≥ 0/,
  );
});

test("allocation: throws when no lines provided", () => {
  assert.throws(() => computeAllocationAmounts(100n, []), /at least one/);
});

test("allocation: tolerates 0.001 sum drift (NUMERIC(7,4) precision)", () => {
  // 33.3334 + 33.3333 + 33.3333 = 100.0000 (within tolerance).
  const out = computeAllocationAmounts(300n, [
    { projectId: "p1", percentage: 33.3334 },
    { projectId: "p2", percentage: 33.3333 },
    { projectId: "p3", percentage: 33.3333 },
  ]);
  const sum = out.reduce((s, l) => s + l.amountMinor, 0n);
  assert.equal(sum, 300n);
});

// ===========================================================================
// 4) weightsToPercentages — RUNTIME tests
// ===========================================================================

test("weightsToPercentages: equal weights yield equal percentages", () => {
  const out = weightsToPercentages({
    weights: { p1: 100, p2: 100, p3: 100 },
  });
  assert.equal(out.length, 3);
  for (const r of out) assert.ok(Math.abs(r.percentage - 33.3333) < 0.01);
});

test("weightsToPercentages: floor areas convert to weighted percentages", () => {
  // 2700 + 1800 + 1500 = 6000 → 45 / 30 / 25.
  const out = weightsToPercentages({
    weights: { eternal: 2700, enso: 1800, ahau: 1500 },
  });
  const eternal = out.find((r) => r.projectId === "eternal")!;
  const enso = out.find((r) => r.projectId === "enso")!;
  const ahau = out.find((r) => r.projectId === "ahau")!;
  assert.equal(eternal.percentage, 45);
  assert.equal(enso.percentage, 30);
  assert.equal(ahau.percentage, 25);
});

test("weightsToPercentages: result sums to exactly 100", () => {
  // Weights designed to produce rounding drift.
  const out = weightsToPercentages({
    weights: { p1: 7, p2: 11, p3: 13 },
  });
  const sum = out.reduce((s, r) => s + r.percentage, 0);
  assert.ok(Math.abs(sum - 100) < 0.0001, `sum was ${sum}`);
});

test("weightsToPercentages: throws on zero total weight", () => {
  assert.throws(
    () => weightsToPercentages({ weights: { p1: 0, p2: 0 } }),
    /total weight must be > 0/,
  );
});

test("weightsToPercentages: throws on empty weights", () => {
  assert.throws(
    () => weightsToPercentages({ weights: {} }),
    /at least one project/,
  );
});

// ===========================================================================
// 5) Approval helper — RUNTIME tests
// ===========================================================================

const sampleThresholds: ApprovalThresholdRow[] = [
  {
    thresholdType: "purchase_request",
    amountMinorMin: 0n,
    amountMinorMax: 50000n,
    currency: "USD",
    requiredRole: "auto_approved",
    requiredApproverCount: 1,
    isActive: true,
  },
  {
    thresholdType: "purchase_request",
    amountMinorMin: 50000n,
    amountMinorMax: 500000n,
    currency: "USD",
    requiredRole: "project_manager",
    requiredApproverCount: 1,
    isActive: true,
  },
  {
    thresholdType: "purchase_request",
    amountMinorMin: 500000n,
    amountMinorMax: 2500000n,
    currency: "USD",
    requiredRole: "director",
    requiredApproverCount: 1,
    isActive: true,
  },
  {
    thresholdType: "purchase_request",
    amountMinorMin: 2500000n,
    amountMinorMax: null,
    currency: "USD",
    requiredRole: "investor_approval",
    requiredApproverCount: 1,
    isActive: true,
  },
];

test("approval: small PR ($300) → auto_approved", () => {
  const out = lookupRequiredApproval({
    thresholdType: "purchase_request",
    amountMinor: 30000n, // $300
    currency: "USD",
    thresholds: sampleThresholds,
  });
  assert.equal(out.requiredRole, "auto_approved");
});

test("approval: mid-size PR ($1,500) → project_manager", () => {
  const out = lookupRequiredApproval({
    thresholdType: "purchase_request",
    amountMinor: 150000n, // $1,500
    currency: "USD",
    thresholds: sampleThresholds,
  });
  assert.equal(out.requiredRole, "project_manager");
});

test("approval: large PR ($10,000) → director", () => {
  const out = lookupRequiredApproval({
    thresholdType: "purchase_request",
    amountMinor: 1000000n, // $10,000
    currency: "USD",
    thresholds: sampleThresholds,
  });
  assert.equal(out.requiredRole, "director");
});

test("approval: huge PR ($100,000) → investor_approval (open-ended top tier)", () => {
  const out = lookupRequiredApproval({
    thresholdType: "purchase_request",
    amountMinor: 10000000n,
    currency: "USD",
    thresholds: sampleThresholds,
  });
  assert.equal(out.requiredRole, "investor_approval");
});

test("approval: missing threshold config → conservative default 'director'", () => {
  const out = lookupRequiredApproval({
    thresholdType: "change_order",
    amountMinor: 100n,
    currency: "USD",
    thresholds: [],
  });
  assert.equal(out.requiredRole, "director");
  assert.equal(out.matchedRow, null);
});

test("approval: inactive thresholds are ignored", () => {
  const inactive: ApprovalThresholdRow[] = sampleThresholds.map((t) => ({
    ...t,
    isActive: false,
  }));
  const out = lookupRequiredApproval({
    thresholdType: "purchase_request",
    amountMinor: 30000n,
    currency: "USD",
    thresholds: inactive,
  });
  assert.equal(out.requiredRole, "director");
});

test("approval: currency mismatch is not a match", () => {
  const out = lookupRequiredApproval({
    thresholdType: "purchase_request",
    amountMinor: 30000n,
    currency: "IDR",
    thresholds: sampleThresholds,
  });
  assert.equal(out.requiredRole, "director"); // fallback
});

test("isRoleSufficient: director satisfies project_manager", () => {
  assert.equal(isRoleSufficient("director", "project_manager"), true);
});

test("isRoleSufficient: project_manager does NOT satisfy director", () => {
  assert.equal(isRoleSufficient("project_manager", "director"), false);
});

test("isRoleSufficient: identical role satisfies itself", () => {
  assert.equal(isRoleSufficient("director", "director"), true);
});

test("isRoleSufficient: unknown role returns false", () => {
  assert.equal(isRoleSufficient("nonexistent", "director"), false);
  assert.equal(isRoleSufficient("director", "nonexistent"), false);
});

test("isRoleSufficient: investor_approval satisfies director", () => {
  assert.equal(isRoleSufficient("investor_approval", "director"), true);
});

// ===========================================================================
// 6) Server modules — static-source guards
// ===========================================================================

test("land-actions exports the 4 core write actions + read queries", () => {
  const path = "src/lib/development/server/land/land-actions.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^import "server-only";/m);
  for (const fn of [
    "upsertLandProfile",
    "createLandPaymentSchedule",
    "markLandInstallmentPaid",
    "addLandTransactionCost",
    "getLandProfileByProject",
    "getLandPaymentSchedule",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `${fn} missing from land-actions`,
    );
  }
});

test("land createLandPaymentSchedule validates installments sum to total (atomic)", () => {
  const src = read("src/lib/development/server/land/land-actions.ts");
  assert.match(src, /Installments sum/);
  assert.match(src, /db\.transaction\(async \(tx\) =>/);
});

test("permit-actions covers create + transition + attach-doc + queries", () => {
  const path = "src/lib/development/server/permits/permit-actions.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^import "server-only";/m);
  for (const fn of [
    "createPermit",
    "transitionPermitStatus",
    "attachPermitDocument",
    "listPermitsByProject",
    "listExpiringPermits",
    "getPermit",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `${fn} missing`,
    );
  }
});

test("tax-actions covers upsert + classify + period-report + queries", () => {
  const path = "src/lib/development/server/tax/tax-actions.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^import "server-only";/m);
  for (const fn of [
    "upsertTaxType",
    "classifyTransactionTax",
    "generateTaxPeriodReport",
    "listActiveTaxTypes",
    "findUnclassifiedTransactions",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `${fn} missing`,
    );
  }
});

test("tax: classification action defaults status to 'classified' (operator review)", () => {
  const src = read("src/lib/development/server/tax/tax-actions.ts");
  assert.match(src, /\.default\("classified"\)/);
});

test("tax: period report uses ON CONFLICT DO UPDATE (idempotent)", () => {
  const src = read("src/lib/development/server/tax/tax-actions.ts");
  assert.match(src, /onConflictDoUpdate/);
});

test("invoice-actions: createInvoice computes subtotal+total from lines (no header trust)", () => {
  const src = read("src/lib/development/server/invoices/invoice-actions.ts");
  assert.match(src, /^import "server-only";/m);
  assert.match(src, /export async function createInvoice/);
  // Total is computed in code from lines, not accepted from the caller.
  assert.match(src, /let subtotal = 0n;[\s\S]+?let taxTotal = 0n;/);
  assert.match(src, /db\.transaction\(async \(tx\) =>/);
});

test("invoice-actions: recordInvoicePayment refuses overpayment + cancelled/voided", () => {
  const src = read("src/lib/development/server/invoices/invoice-actions.ts");
  assert.match(src, /Payment would exceed invoice total/);
  assert.match(src, /Cannot record payment on a/);
});

test("invoice-actions: payment status flips to 'paid' when fully paid, else 'partial_paid'", () => {
  const src = read("src/lib/development/server/invoices/invoice-actions.ts");
  assert.match(
    src,
    /newPaid >= total \? "paid" : "partial_paid"/,
  );
});

test("shared-cost-actions: proposeSharedCostAllocation calls computeAllocationAmounts", () => {
  const src = read(
    "src/lib/development/server/shared-costs/shared-cost-actions.ts",
  );
  assert.match(src, /^import "server-only";/m);
  assert.match(src, /computeAllocationAmounts/);
  assert.match(src, /db\.transaction\(async \(tx\) =>/);
});

test("shared-cost-actions: approve creates derivative dev_transactions atomically", () => {
  const src = read(
    "src/lib/development/server/shared-costs/shared-cost-actions.ts",
  );
  assert.match(src, /export async function approveSharedCostAllocation/);
  assert.match(src, /\.insert\(devTransactions\)/);
  // Must be inside a transaction.
  assert.match(
    src,
    /approveSharedCostAllocation[\s\S]+?db\.transaction\(async \(tx\) =>/,
  );
});

test("procurement-actions exports create + transition + add quotation + select winner", () => {
  const path =
    "src/lib/development/server/procurement/procurement-actions.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^import "server-only";/m);
  for (const fn of [
    "createPurchaseRequest",
    "transitionPurchaseRequest",
    "addQuotation",
    "selectQuotation",
    "listPurchaseRequests",
    "getPurchaseRequest",
    "listApprovalThresholds",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `${fn} missing`,
    );
  }
});

test("procurement-actions: selectQuotation creates PO atomically + rejects siblings", () => {
  const src = read(
    "src/lib/development/server/procurement/procurement-actions.ts",
  );
  assert.match(src, /\.insert\(materialPurchaseOrders\)/);
  // The losing siblings must be marked rejected in the same transaction.
  assert.match(
    src,
    /selectQuotation[\s\S]+?db\.transaction\(async \(tx\) =>[\s\S]+?Reject siblings/,
  );
});

test("procurement-actions: transitionPurchaseRequest does defense-in-depth approval check", () => {
  const src = read(
    "src/lib/development/server/procurement/procurement-actions.ts",
  );
  assert.match(src, /lookupRequiredApproval/);
  assert.match(src, /Defense-in-depth approval check/);
});

// ===========================================================================
// 7) Cron jobs + dispatcher wiring
// ===========================================================================

test("all 5 Stage 4.A cron job files exist with server-only guard", () => {
  for (const path of [
    "src/lib/development/server/cron/tax-classification-reminder-job.ts",
    "src/lib/development/server/cron/permit-expiry-alert-job.ts",
    "src/lib/development/server/cron/land-installment-due-job.ts",
    "src/lib/development/server/cron/tax-period-report-job.ts",
    "src/lib/development/server/cron/purchase-request-expiry-job.ts",
  ]) {
    assert.ok(exists(path), `${path} missing`);
    assert.match(read(path), /^import "server-only";/m);
  }
});

test("all 5 Stage 4.A cron HTTP routes exist", () => {
  for (const slug of [
    "dev-os-tax-classification-reminder",
    "dev-os-permit-expiry-alert",
    "dev-os-land-installment-due",
    "dev-os-tax-period-report",
    "dev-os-purchase-request-expiry",
  ]) {
    const route = `src/app/api/cron/${slug}/route.ts`;
    assert.ok(exists(route), `${route} missing`);
    assert.match(read(route), /handleCronJobRequest/);
  }
});

test("all 5 Stage 4.A jobs registered in KNOWN_JOBS + dispatcher + DEV_OS_JOB_KEYS", () => {
  const a = read("src/features/jobs/actions.ts");
  const c = read("src/lib/development/server/cron/index.ts");
  for (const key of [
    "dev_os_tax_classification_reminder",
    "dev_os_permit_expiry_alert",
    "dev_os_land_installment_due",
    "dev_os_tax_period_report",
    "dev_os_purchase_request_expiry",
  ]) {
    assert.ok(a.includes(`"${key}"`), `${key} missing from KNOWN_JOBS`);
    assert.ok(a.includes(`case "${key}":`), `${key} missing case in dispatcher`);
    assert.ok(c.includes(`"${key}"`), `${key} missing from DEV_OS_JOB_KEYS`);
  }
});

test("VERCEL-CRON-CHECKLIST documents all 5 Stage 4.A crons", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  for (const slug of [
    "dev-os-tax-classification-reminder",
    "dev-os-permit-expiry-alert",
    "dev-os-land-installment-due",
    "dev-os-tax-period-report",
    "dev-os-purchase-request-expiry",
  ]) {
    assert.ok(md.includes(`/api/cron/${slug}`), `${slug} missing from checklist`);
  }
});

test("tax-period-report cron uses monthly cadence (1st of month at 02:00)", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /dev-os-tax-period-report.+0 2 1 \* \*/);
});

// ===========================================================================
// 8) Demo seed extension
// ===========================================================================

test("seed-dev-os.mjs seeds land profiles for the 3 demo projects", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO land_profiles/);
  assert.match(src, /eternal-villas[\s\S]+?leasehold/);
});

test("seed-dev-os.mjs seeds 4 Indonesia-realistic tax types", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO tax_types/);
  for (const key of [
    "ppn_indonesia",
    "pph23_withholding",
    "lease_tax_bali",
    "corporate_income_tax",
  ]) {
    assert.ok(src.includes(key), `tax type ${key} missing`);
  }
});

test("seed-dev-os.mjs wraps shared-cost lines in a transaction (deferrable trigger)", () => {
  const src = read("scripts/seed-dev-os.mjs");
  // The DEFERRABLE INITIALLY DEFERRED constraint requires explicit
  // transaction wrapping when postgres-js is in autocommit mode.
  assert.match(src, /sql\.begin\(async \(tx\) =>/);
});

test("seed-dev-os.mjs creates demo dev_invoices + dev_invoice_lines", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO dev_invoices/);
  assert.match(src, /INSERT INTO dev_invoice_lines/);
});

test("seed-dev-os.mjs creates 8 demo dev_os_purchase_requests across statuses", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO dev_os_purchase_requests/);
  assert.match(src, /PR-DEMO-/);
});

test("seed-dev-os.mjs creates demo procurement_quotations on a 'quotations_in_progress' PR", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO procurement_quotations/);
});

// ===========================================================================
// 9) Additional migration / table coverage
// ===========================================================================

test("migration 0045 creates land_payment_schedules with currency default USD", () => {
  const sql = read(MIG_0045);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "land_payment_schedules"/);
  assert.match(sql, /"currency" TEXT NOT NULL DEFAULT 'USD'/);
});

test("migration 0045 land_transaction_costs has 14-value cost_type CHECK", () => {
  const sql = read(MIG_0045);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "land_transaction_costs"/);
  for (const ct of [
    "lease_tax",
    "purchase_tax",
    "notary_fee",
    "legal_due_diligence",
    "land_survey",
    "topographic_survey",
    "soil_test",
    "brokerage_fee",
    "agent_commission",
    "land_clearance",
    "access_road_preparation",
    "boundary_marking",
    "utility_connection",
    "environmental_assessment",
    "custom",
  ]) {
    assert.ok(sql.includes(`'${ct}'`), `cost_type '${ct}' missing`);
  }
});

test("migration 0045 project_permits expires_at index is partial (only NOT NULL rows)", () => {
  const sql = read(MIG_0045);
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS "project_permits_expires_idx"[\s\S]+?WHERE "expires_at" IS NOT NULL/,
  );
});

test("migration 0045 project_permit_documents enforces unique (permit_id, document_id)", () => {
  const sql = read(MIG_0045);
  assert.match(
    sql,
    /UNIQUE \("permit_id", "document_id"\)/,
  );
});

test("migration 0046 creates tax_period_reports with UNIQUE(tax_type, period_start, period_end)", () => {
  const sql = read(MIG_0046);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "tax_period_reports"/);
  assert.match(
    sql,
    /UNIQUE \("tax_type_id", "period_start", "period_end"\)/,
  );
});

test("migration 0046 tax_types rate_percentage CHECK is in [0, 100]", () => {
  const sql = read(MIG_0046);
  assert.match(
    sql,
    /"rate_percentage" >= 0 AND "rate_percentage" <= 100/,
  );
});

test("migration 0046 dev_invoices unique on (invoice_number, project_id)", () => {
  const sql = read(MIG_0046);
  assert.match(
    sql,
    /UNIQUE \("invoice_number", "project_id"\)/,
  );
});

test("migration 0046 dev_invoices.due_date partial index excludes terminal states", () => {
  const sql = read(MIG_0046);
  assert.match(
    sql,
    /dev_invoices_due_date_idx[\s\S]+?WHERE "status" NOT IN \('paid', 'cancelled', 'voided'\)/,
  );
});

test("migration 0047 enforces percentage CHECK in (0, 100]", () => {
  const sql = read(MIG_0047);
  assert.match(
    sql,
    /"percentage" > 0 AND "percentage" <= 100/,
  );
});

test("migration 0047 dev_os_purchase_requests requires positive quantity", () => {
  const sql = read(MIG_0047);
  assert.match(sql, /"quantity" NUMERIC\(12, 4\) NOT NULL CHECK \("quantity" > 0\)/);
});

test("migration 0047 procurement_quotations enforces unique (request, vendor)", () => {
  const sql = read(MIG_0047);
  assert.match(
    sql,
    /UNIQUE \("purchase_request_id", "vendor_id"\)/,
  );
});

test("migration 0047 procurement_quotations.total_amount_minor must be > 0", () => {
  const sql = read(MIG_0047);
  assert.match(sql, /"total_amount_minor" BIGINT NOT NULL CHECK \("total_amount_minor" > 0\)/);
});

test("migration 0047 procurement_quotation_lines line_total_minor is GENERATED STORED", () => {
  const sql = read(MIG_0047);
  assert.match(
    sql,
    /"line_total_minor" BIGINT[\s\S]+?GENERATED ALWAYS AS[\s\S]+?STORED/,
  );
});

test("migration 0047 approval_thresholds requires positive approver count", () => {
  const sql = read(MIG_0047);
  assert.match(sql, /"required_approver_count" INTEGER NOT NULL DEFAULT 1/);
});

// ===========================================================================
// 10) More allocation helper edge cases
// ===========================================================================

test("allocation: zero source amount produces zero per-line amounts", () => {
  const out = computeAllocationAmounts(0n, [
    { projectId: "p1", percentage: 50 },
    { projectId: "p2", percentage: 50 },
  ]);
  assert.equal(out[0].amountMinor, 0n);
  assert.equal(out[1].amountMinor, 0n);
});

test("allocation: single 100% line gets the entire source", () => {
  const out = computeAllocationAmounts(1234567n, [
    { projectId: "only", percentage: 100 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].amountMinor, 1234567n);
});

test("allocation: very large amount (BIGINT) splits without overflow", () => {
  // 9_000_000_000_000_000n is well under MAX_BIGINT but well over Number.MAX_SAFE_INTEGER.
  const huge = 9_000_000_000_000_000n;
  const out = computeAllocationAmounts(huge, [
    { projectId: "p1", percentage: 33.3334 },
    { projectId: "p2", percentage: 33.3333 },
    { projectId: "p3", percentage: 33.3333 },
  ]);
  const sum = out.reduce((s, l) => s + l.amountMinor, 0n);
  assert.equal(sum, huge);
});

test("allocation output preserves the input projectId order", () => {
  const out = computeAllocationAmounts(100n, [
    { projectId: "z", percentage: 25 },
    { projectId: "a", percentage: 75 },
  ]);
  assert.equal(out[0].projectId, "z");
  assert.equal(out[1].projectId, "a");
});

// ===========================================================================
// 11) Approval helper: narrowest envelope wins when multiple match
// ===========================================================================

test("approval: narrower envelope wins over open-ended one", () => {
  const overlapping: ApprovalThresholdRow[] = [
    {
      thresholdType: "purchase_request",
      amountMinorMin: 0n,
      amountMinorMax: null, // open-ended
      currency: "USD",
      requiredRole: "director",
      requiredApproverCount: 1,
      isActive: true,
    },
    {
      thresholdType: "purchase_request",
      amountMinorMin: 0n,
      amountMinorMax: 10000n, // narrower
      currency: "USD",
      requiredRole: "auto_approved",
      requiredApproverCount: 1,
      isActive: true,
    },
  ];
  const out = lookupRequiredApproval({
    thresholdType: "purchase_request",
    amountMinor: 5000n,
    currency: "USD",
    thresholds: overlapping,
  });
  assert.equal(out.requiredRole, "auto_approved");
});

// ===========================================================================
// 12) Cron job content guards
// ===========================================================================

test("permit-expiry cron buckets at 30/60/90 days", () => {
  const src = read(
    "src/lib/development/server/cron/permit-expiry-alert-job.ts",
  );
  assert.match(src, /\[30, 60, 90\]/);
});

test("land-installment-due cron splits 'due_soon' (14d) from 'overdue'", () => {
  const src = read(
    "src/lib/development/server/cron/land-installment-due-job.ts",
  );
  assert.match(src, /14 \* 24 \* 60 \* 60/);
  assert.match(src, /due_date < /);
});

test("tax-classification-reminder cron filters at 7 days old", () => {
  const src = read(
    "src/lib/development/server/cron/tax-classification-reminder-job.ts",
  );
  assert.match(src, /7 \* 24 \* 60 \* 60/);
  assert.match(src, /'unclassified'/);
});

test("tax-period-report cron generates the prior calendar month window", () => {
  const src = read(
    "src/lib/development/server/cron/tax-period-report-job.ts",
  );
  // periodEnd is the LAST DAY of prior month (day 0 of current month).
  assert.match(src, /now\.getMonth\(\), 0/);
});

test("purchase-request-expiry cron excludes terminal states", () => {
  const src = read(
    "src/lib/development/server/cron/purchase-request-expiry-job.ts",
  );
  assert.match(
    src,
    /status NOT IN \('po_created', 'cancelled', 'rejected'\)/,
  );
});

// ===========================================================================
// 13) Schema export coverage
// ===========================================================================

test("land schema exports the 4 typed objects + types", () => {
  const src = read("src/lib/db/schema/land.ts");
  for (const exp of [
    "landProfiles",
    "landPaymentSchedules",
    "landPaymentInstallments",
    "landTransactionCosts",
  ]) {
    assert.match(src, new RegExp(`export const ${exp} `));
  }
});

test("permits schema exports projectPermits + projectPermitDocuments", () => {
  const src = read("src/lib/db/schema/permits.ts");
  assert.match(src, /export const projectPermits /);
  assert.match(src, /export const projectPermitDocuments /);
});

test("tax schema exports taxTypes + taxPeriodReports", () => {
  const src = read("src/lib/db/schema/tax.ts");
  assert.match(src, /export const taxTypes /);
  assert.match(src, /export const taxPeriodReports /);
});

test("invoices schema exports devInvoices + devInvoiceLines + correct types", () => {
  const src = read("src/lib/db/schema/invoices.ts");
  assert.match(src, /export const devInvoices /);
  assert.match(src, /export const devInvoiceLines /);
  assert.match(src, /export type DevInvoice /);
});

test("shared-costs schema exports sharedCostAllocations + sharedCostAllocationLines", () => {
  const src = read("src/lib/db/schema/shared-costs.ts");
  assert.match(src, /export const sharedCostAllocations /);
  assert.match(src, /export const sharedCostAllocationLines /);
});

test("procurement schema exports devOsPurchaseRequests + procurementQuotations + lines + thresholds", () => {
  const src = read("src/lib/db/schema/procurement.ts");
  for (const exp of [
    "devOsPurchaseRequests",
    "procurementQuotations",
    "procurementQuotationLines",
    "approvalThresholds",
  ]) {
    assert.match(src, new RegExp(`export const ${exp} `));
  }
});
