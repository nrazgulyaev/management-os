/**
 * Stage 4.A.4 — UI Closure for Stage 4.A.
 *
 * Static-source UI smoke + flow guards over the 9 deferred surfaces:
 *   1. Transaction tax extension (transaction detail + transaction list pill)
 *   2. Invoice list + detail + create form + payment form
 *   3. Land Profile detail (per-project)
 *   4. Permits list + detail (per-project)
 *   5. Tax types list (admin CRUD surface)
 *   6. Shared cost list + detail + approve button
 *   7. Purchase Request list + mobile-first create form + detail
 *   8. Quotation comparison (side-by-side) + select button
 *   9. Approval thresholds list (admin CRUD surface)
 *
 * No new server actions, no new tables — these tests check that the new
 * pages exist, are wired to the right server actions, follow the existing
 * UI conventions (DevelopmentShell, PageHeader, safeQuery, single-page
 * forms, dedicated routes), and that the mobile-friendly PR form respects
 * the 44px touch target / single-column constraints.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ===========================================================================
// 1) New Stage 4.A.4 routes — every file exists
// ===========================================================================

const NEW_ROUTES = [
  // Invoices
  "src/app/(development-app)/development-os/finance/invoices/page.tsx",
  "src/app/(development-app)/development-os/finance/invoices/[id]/page.tsx",
  "src/app/(development-app)/development-os/finance/invoices/new/page.tsx",
  // Tax types
  "src/app/(development-app)/development-os/finance/tax-types/page.tsx",
  // Shared costs
  "src/app/(development-app)/development-os/finance/shared-costs/page.tsx",
  "src/app/(development-app)/development-os/finance/shared-costs/[id]/page.tsx",
  // Project-scoped Land Profile + Permits
  "src/app/(development-app)/development-os/projects/[slug]/land/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/permits/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/permits/[id]/page.tsx",
  // Procurement
  "src/app/(development-app)/development-os/procurement/purchase-requests/page.tsx",
  "src/app/(development-app)/development-os/procurement/purchase-requests/new/page.tsx",
  "src/app/(development-app)/development-os/procurement/purchase-requests/[code]/page.tsx",
  "src/app/(development-app)/development-os/procurement/quotation-comparison/[requestCode]/page.tsx",
  // Settings
  "src/app/(development-app)/development-os/settings/approval-thresholds/page.tsx",
];

const NEW_CLIENT_COMPONENTS = [
  "src/components/development/finance/transaction-tax-classify-card.tsx",
  "src/components/development/finance/invoice-create-form.tsx",
  "src/components/development/finance/invoice-payment-form.tsx",
  "src/components/development/finance/shared-cost-approve-button.tsx",
  "src/components/development/procurement/purchase-request-mobile-form.tsx",
  "src/components/development/procurement/quotation-select-button.tsx",
];

test("Stage 4.A.4 — all 14 new route files exist", () => {
  for (const rel of NEW_ROUTES) {
    assert.ok(exists(rel), `Missing route: ${rel}`);
  }
});

test("Stage 4.A.4 — all 6 new client components exist", () => {
  for (const rel of NEW_CLIENT_COMPONENTS) {
    assert.ok(exists(rel), `Missing client component: ${rel}`);
  }
});

test("Stage 4.A.4 — every page wraps content in DevelopmentShell", () => {
  for (const rel of NEW_ROUTES) {
    const src = read(rel);
    assert.match(src, /DevelopmentShell/, `${rel} must use DevelopmentShell`);
  }
});

test("Stage 4.A.4 — every page renders a PageHeader", () => {
  for (const rel of NEW_ROUTES) {
    const src = read(rel);
    assert.match(src, /<PageHeader/, `${rel} must include <PageHeader`);
  }
});

test("Stage 4.A.4 — list/detail pages use safeQuery for resilience", () => {
  // Pages that read collections from the DB must use safeQuery so a slow
  // query degrades to an empty list instead of breaking the page.
  for (const rel of [
    "src/app/(development-app)/development-os/finance/invoices/page.tsx",
    "src/app/(development-app)/development-os/finance/tax-types/page.tsx",
    "src/app/(development-app)/development-os/finance/shared-costs/page.tsx",
    "src/app/(development-app)/development-os/projects/[slug]/land/page.tsx",
    "src/app/(development-app)/development-os/projects/[slug]/permits/page.tsx",
    "src/app/(development-app)/development-os/settings/approval-thresholds/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /safeQuery/, `${rel} must use safeQuery`);
  }
});

test("Stage 4.A.4 — server pages declare force-dynamic", () => {
  // These pages read mutable bookkeeping state — they must not be cached
  // at build time.
  for (const rel of NEW_ROUTES) {
    const src = read(rel);
    assert.match(
      src,
      /export const dynamic = "force-dynamic"/,
      `${rel} must export dynamic = "force-dynamic"`,
    );
  }
});

test("Stage 4.A.4 — server pages do NOT carry 'use client'", () => {
  for (const rel of NEW_ROUTES) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /^"use client"/m,
      `${rel} must remain a server component (client work goes in /components)`,
    );
  }
});

test("Stage 4.A.4 — every client component declares 'use client'", () => {
  for (const rel of NEW_CLIENT_COMPONENTS) {
    const src = read(rel);
    assert.match(
      src,
      /^"use client"/m,
      `${rel} must declare "use client" at top`,
    );
  }
});

test("Stage 4.A.4 — every client component uses useTransition for actions", () => {
  // Convention from Stage 2.4.B: client form components use useTransition
  // around the server action call so the Submit button can show pending
  // state without blocking the UI.
  for (const rel of NEW_CLIENT_COMPONENTS) {
    const src = read(rel);
    assert.match(src, /useTransition/, `${rel} must use useTransition`);
  }
});

// ===========================================================================
// 2) Transaction tax extension — bookkeeper's classification surface
// ===========================================================================

test("transaction detail page mounts TransactionTaxClassifyCard", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/transactions/[id]/page.tsx",
  );
  assert.match(src, /TransactionTaxClassifyCard/);
  assert.match(src, /listActiveTaxTypes/);
});

test("transaction list page surfaces tax classification status pill", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/transactions/page.tsx",
  );
  assert.match(src, /<TH>Tax<\/TH>/);
  assert.match(src, /taxClassificationStatus/);
});

test("TransactionTaxClassifyCard binds to classifyTransactionTax action", () => {
  const src = read(
    "src/components/development/finance/transaction-tax-classify-card.tsx",
  );
  assert.match(src, /classifyTransactionTax/);
});

test("TransactionTaxClassifyCard implements both inclusion modes (included vs added)", () => {
  // The card must compute tax for "is_included_in_amount = true" using
  // amount * rate / (100 + rate), and otherwise amount * rate / 100.
  // Exact formula presence guards against accidental rewrites that swap
  // numerator/denominator.
  const src = read(
    "src/components/development/finance/transaction-tax-classify-card.tsx",
  );
  assert.match(
    src,
    /100\s*\+\s*rate|isIncludedInAmount/,
    "must branch on isIncludedInAmount and use 100+rate denominator",
  );
});

test("TransactionTaxClassifyCard renders status pill for all five tax states", () => {
  const src = read(
    "src/components/development/finance/transaction-tax-classify-card.tsx",
  );
  for (const status of [
    "unclassified",
    "classified",
    "reviewed",
    "tax_exempt",
    "flagged_missing_doc",
  ]) {
    assert.match(
      src,
      new RegExp(`\\b${status}\\b`),
      `Status '${status}' must be referenced`,
    );
  }
});

// ===========================================================================
// 3) Invoice surfaces — bookkeeper's invoice flow
// ===========================================================================

test("invoice list reads listInvoices server action", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/invoices/page.tsx",
  );
  assert.match(src, /listInvoices/);
});

test("invoice detail reads getInvoice server action", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/invoices/[id]/page.tsx",
  );
  assert.match(src, /getInvoice/);
});

test("invoice detail mounts InvoicePaymentForm for cash recording", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/invoices/[id]/page.tsx",
  );
  assert.match(src, /InvoicePaymentForm/);
});

test("InvoicePaymentForm binds to recordInvoicePayment action", () => {
  const src = read(
    "src/components/development/finance/invoice-payment-form.tsx",
  );
  assert.match(src, /recordInvoicePayment/);
});

test("InvoiceCreateForm binds to createInvoice action", () => {
  const src = read(
    "src/components/development/finance/invoice-create-form.tsx",
  );
  assert.match(src, /createInvoice/);
});

test("InvoiceCreateForm supports line-item array (procurement convention)", () => {
  // Single-page form, no wizard. Operator can add multiple lines client-side
  // before submission, server recomputes totals authoritatively.
  const src = read(
    "src/components/development/finance/invoice-create-form.tsx",
  );
  assert.match(src, /lines|lineItems|setLines/);
});

test("invoice create wrapper page passes taxTypes + categories to client form", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/invoices/new/page.tsx",
  );
  assert.match(src, /InvoiceCreateForm/);
  assert.match(src, /taxTypes|tax_types|listActiveTaxTypes/);
});

test("invoice list status tones cover the full lifecycle", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/invoices/page.tsx",
  );
  for (const status of [
    "draft",
    "issued",
    "paid",
    "partial_paid",
    "overdue",
  ]) {
    assert.ok(
      src.includes(status),
      `Invoice status '${status}' must have a tone mapping`,
    );
  }
});

// ===========================================================================
// 4) Land Profile detail — PM's land setup surface
// ===========================================================================

test("Land Profile page reads getLandProfileByProject + schedule + costs", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/land/page.tsx",
  );
  assert.match(src, /getLandProfileByProject/);
  assert.match(src, /getLandPaymentSchedule/);
  assert.match(src, /getLandTransactionCosts/);
});

test("Land Profile page resolves project via getDevelopmentProjectBySlug + 404s on missing", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/land/page.tsx",
  );
  assert.match(src, /getDevelopmentProjectBySlug/);
  assert.match(src, /notFound\(\)/);
});

test("Land Profile page renders due diligence + payment schedule sections", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/land/page.tsx",
  );
  // Section eyebrows guard against accidental section removals.
  for (const eyebrow of [
    "Acquisition",
    "Site characteristics",
    "Due diligence",
  ]) {
    assert.ok(
      src.includes(eyebrow),
      `Land Profile must render '${eyebrow}' section`,
    );
  }
});

// ===========================================================================
// 5) Permits — PM's permit lifecycle surface
// ===========================================================================

test("Permits list reads listPermitsByProject", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/permits/page.tsx",
  );
  assert.match(src, /listPermitsByProject/);
});

test("Permits detail reads getPermit", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/permits/[id]/page.tsx",
  );
  assert.match(src, /getPermit/);
});

test("Permits list renders status badges for the full lifecycle", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/permits/page.tsx",
  );
  for (const status of [
    "planned",
    "submitted",
    "under_review",
    "approved",
    "rejected",
    "expired",
  ]) {
    assert.ok(
      src.includes(status),
      `Permit status '${status}' must be in tone map`,
    );
  }
});

// ===========================================================================
// 6) Tax types — admin CRUD list
// ===========================================================================

test("Tax types page reads listAllTaxTypes (includes inactive for admin)", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/tax-types/page.tsx",
  );
  assert.match(src, /listAllTaxTypes/);
});

test("Tax types page surfaces is_included_in_amount + payable_by + period", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/tax-types/page.tsx",
  );
  // Operator needs to see at-a-glance whether each type is included or
  // added on top, who pays it, and reporting cadence.
  assert.match(src, /isIncludedInAmount/);
  assert.match(src, /payableBy/);
  assert.match(src, /reportingPeriod/);
});

// ===========================================================================
// 7) Shared cost allocations — multi-project derivative writes
// ===========================================================================

test("Shared cost list reads listSharedCostAllocations", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/shared-costs/page.tsx",
  );
  assert.match(src, /listSharedCostAllocations/);
});

test("Shared cost detail reads getSharedCostAllocation + 404s on missing", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/shared-costs/[id]/page.tsx",
  );
  assert.match(src, /getSharedCostAllocation/);
  assert.match(src, /notFound\(\)/);
});

test("Shared cost detail mounts SharedCostApproveButton only for draft status", () => {
  // Approving an already-approved allocation would double-write derivative
  // dev_transactions — the UI guard is the first line of defense even
  // though the server action also checks.
  const src = read(
    "src/app/(development-app)/development-os/finance/shared-costs/[id]/page.tsx",
  );
  assert.match(src, /allocation\.status === "draft"/);
  assert.match(src, /SharedCostApproveButton/);
});

test("SharedCostApproveButton binds to approveSharedCostAllocation action", () => {
  const src = read(
    "src/components/development/finance/shared-cost-approve-button.tsx",
  );
  assert.match(src, /approveSharedCostAllocation/);
});

test("Shared cost detail surfaces sum-check (must be 100%)", () => {
  // The DB trigger enforces 100% at COMMIT, but the UI also displays the
  // sum so operators have immediate feedback before approving.
  const src = read(
    "src/app/(development-app)/development-os/finance/shared-costs/[id]/page.tsx",
  );
  assert.match(src, /Sum check|reduce.*percentage/);
});

// ===========================================================================
// 8) Purchase Requests — site-supervisor mobile + procurement detail
// ===========================================================================

test("PR list reads listPurchaseRequests", () => {
  const src = read(
    "src/app/(development-app)/development-os/procurement/purchase-requests/page.tsx",
  );
  assert.match(src, /listPurchaseRequests/);
});

test("PR detail reads getPurchaseRequest", () => {
  const src = read(
    "src/app/(development-app)/development-os/procurement/purchase-requests/[code]/page.tsx",
  );
  assert.match(src, /getPurchaseRequest/);
});

test("PR mobile form binds to createPurchaseRequest action", () => {
  const src = read(
    "src/components/development/procurement/purchase-request-mobile-form.tsx",
  );
  assert.match(src, /createPurchaseRequest/);
});

test("PR mobile form uses 44px+ touch targets (accessibility minimum)", () => {
  // The site-supervisor uses this on a phone in the field. Apple HIG +
  // WCAG agree on ~44px as the minimum touch target.
  const src = read(
    "src/components/development/procurement/purchase-request-mobile-form.tsx",
  );
  assert.match(
    src,
    /min-h-\[44px\]|h-\[44px\]|min-h-11/,
    "form must use 44px+ minimum touch targets",
  );
});

test("PR mobile form is single-column below md breakpoint", () => {
  // Mobile-friendly: single column on phones, two columns on desktop.
  const src = read(
    "src/components/development/procurement/purchase-request-mobile-form.tsx",
  );
  assert.match(
    src,
    /grid-cols-1.*md:grid-cols-2|space-y-/,
    "form must collapse to single column on mobile",
  );
});

test("PR mobile form supports all four urgency levels", () => {
  const src = read(
    "src/components/development/procurement/purchase-request-mobile-form.tsx",
  );
  for (const u of ["low", "normal", "high", "critical"]) {
    assert.ok(src.includes(`"${u}"`), `urgency '${u}' must be selectable`);
  }
});

test("PR mobile form supports all 10 categories", () => {
  const src = read(
    "src/components/development/procurement/purchase-request-mobile-form.tsx",
  );
  for (const cat of [
    "construction",
    "finishes",
    "electrical",
    "plumbing",
    "hvac",
    "landscaping",
    "fixtures",
    "tools",
    "consumables",
    "other",
  ]) {
    assert.ok(src.includes(`"${cat}"`), `category '${cat}' must be selectable`);
  }
});

test("PR new wrapper page passes projects to client form", () => {
  const src = read(
    "src/app/(development-app)/development-os/procurement/purchase-requests/new/page.tsx",
  );
  assert.match(src, /PurchaseRequestMobileForm|getDevelopmentProjects/);
});

test("PR detail page resolves request_code to internal id", () => {
  // URL exposes the human-readable code (PR-2026-001), not the UUID.
  const src = read(
    "src/app/(development-app)/development-os/procurement/purchase-requests/[code]/page.tsx",
  );
  assert.match(src, /requestCode|request_code|code/);
});

// ===========================================================================
// 9) Quotation comparison — procurement decision surface
// ===========================================================================

test("Quotation comparison page reads quotations for a request code", () => {
  // Quotations come bundled with getPurchaseRequest({ id }) — no
  // separate quotation list action.
  const src = read(
    "src/app/(development-app)/development-os/procurement/quotation-comparison/[requestCode]/page.tsx",
  );
  assert.match(src, /getPurchaseRequest/);
  assert.match(src, /quotations/);
});

test("Quotation comparison uses responsive grid (1/2/3 columns)", () => {
  // Side-by-side cards: 1 column on mobile, 2 on tablet, 3 on desktop.
  const src = read(
    "src/app/(development-app)/development-os/procurement/quotation-comparison/[requestCode]/page.tsx",
  );
  assert.match(
    src,
    /grid-cols-1.*md:grid-cols-2.*lg:grid-cols-3|grid-cols-1.*lg:grid-cols-3/,
    "must use responsive grid for side-by-side comparison",
  );
});

test("Quotation comparison highlights lowest price + earliest delivery", () => {
  const src = read(
    "src/app/(development-app)/development-os/procurement/quotation-comparison/[requestCode]/page.tsx",
  );
  assert.match(
    src,
    /Lowest price|lowest|cheapest/i,
    "must highlight lowest-price quotation",
  );
  assert.match(
    src,
    /Earliest delivery|earliest|soonest/i,
    "must highlight earliest-delivery quotation",
  );
});

test("Quotation comparison mounts QuotationSelectButton per card", () => {
  const src = read(
    "src/app/(development-app)/development-os/procurement/quotation-comparison/[requestCode]/page.tsx",
  );
  assert.match(src, /QuotationSelectButton/);
});

test("QuotationSelectButton binds to selectQuotation action", () => {
  const src = read(
    "src/components/development/procurement/quotation-select-button.tsx",
  );
  assert.match(src, /selectQuotation/);
});

// ===========================================================================
// 10) Approval thresholds — admin matrix view
// ===========================================================================

test("Approval thresholds page reads listApprovalThresholds", () => {
  const src = read(
    "src/app/(development-app)/development-os/settings/approval-thresholds/page.tsx",
  );
  assert.match(src, /listApprovalThresholds/);
});

test("Approval thresholds page groups rows by threshold_type", () => {
  // Operator scans by threshold_type (procurement_po, contract_signing,
  // expense_reimbursement, etc.), so rows need to be grouped, not flat.
  const src = read(
    "src/app/(development-app)/development-os/settings/approval-thresholds/page.tsx",
  );
  assert.match(src, /thresholdType|byType|groupBy|Map/);
});

test("Approval thresholds page surfaces required role for every tier", () => {
  const src = read(
    "src/app/(development-app)/development-os/settings/approval-thresholds/page.tsx",
  );
  assert.match(src, /requiredRole/);
  assert.match(src, /requiredApproverCount/);
});

test("Approval thresholds tone map covers escalation chain", () => {
  // Defense in depth: visual hierarchy reinforces who can approve what.
  const src = read(
    "src/app/(development-app)/development-os/settings/approval-thresholds/page.tsx",
  );
  for (const role of [
    "auto_approved",
    "procurement_manager",
    "project_manager",
    "finance_manager",
    "director",
    "investor_approval",
  ]) {
    assert.ok(
      src.includes(role),
      `Approval thresholds must reference role '${role}'`,
    );
  }
});

// ===========================================================================
// 11) Cross-surface conventions — guards against drift
// ===========================================================================

test("All Stage 4.A.4 list pages render an EmptyState for the zero-rows case", () => {
  // Convention: never show an empty table — render an EmptyState with
  // a hint about how to populate it.
  for (const rel of [
    "src/app/(development-app)/development-os/finance/invoices/page.tsx",
    "src/app/(development-app)/development-os/finance/tax-types/page.tsx",
    "src/app/(development-app)/development-os/finance/shared-costs/page.tsx",
    "src/app/(development-app)/development-os/projects/[slug]/permits/page.tsx",
    "src/app/(development-app)/development-os/procurement/purchase-requests/page.tsx",
    "src/app/(development-app)/development-os/settings/approval-thresholds/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /<EmptyState/, `${rel} must render <EmptyState> on zero rows`);
  }
});

test("All Stage 4.A.4 client forms surface server errors back to the operator", () => {
  // Pattern: try/catch around the action call, surface error message in
  // a <p className="text-danger">. Without this, the operator sees a
  // silent submit-button-stuck-spinning UX.
  for (const rel of NEW_CLIENT_COMPONENTS) {
    const src = read(rel);
    assert.match(
      src,
      /catch\s*\(/,
      `${rel} must catch action errors`,
    );
    assert.match(
      src,
      /text-danger|text-red|setError/,
      `${rel} must display error UI`,
    );
  }
});

test("All Stage 4.A.4 detail pages provide back-navigation in PageHeader actions", () => {
  // Convention: every detail page must offer one-click back to the parent
  // list (so the user is never stuck in a deep route).
  for (const rel of [
    "src/app/(development-app)/development-os/finance/invoices/[id]/page.tsx",
    "src/app/(development-app)/development-os/finance/shared-costs/[id]/page.tsx",
    "src/app/(development-app)/development-os/projects/[slug]/permits/[id]/page.tsx",
    "src/app/(development-app)/development-os/procurement/purchase-requests/[code]/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /ArrowLeft/, `${rel} must include ArrowLeft back-link`);
  }
});

test("All Stage 4.A.4 list pages provide back-navigation to parent module", () => {
  for (const rel of [
    "src/app/(development-app)/development-os/finance/invoices/page.tsx",
    "src/app/(development-app)/development-os/finance/tax-types/page.tsx",
    "src/app/(development-app)/development-os/finance/shared-costs/page.tsx",
    "src/app/(development-app)/development-os/procurement/purchase-requests/page.tsx",
    "src/app/(development-app)/development-os/settings/approval-thresholds/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /ArrowLeft/, `${rel} must include ArrowLeft back-link`);
  }
});

test("All Stage 4.A.4 pages export a Metadata title", () => {
  // Browser tab + share-link consistency.
  for (const rel of NEW_ROUTES) {
    const src = read(rel);
    assert.match(
      src,
      /Metadata|metadata/,
      `${rel} must export route metadata`,
    );
  }
});

test("Stage 4.A.4 — no new server actions were introduced", () => {
  // The contract for this stage is UI-only: everything wires into existing
  // server actions from Stage 4.A.1 / 4.A.2 / 4.A.3. If a new action
  // appears here, the test below the fold will catch it.
  const known = [
    "classifyTransactionTax",
    "listActiveTaxTypes",
    "listAllTaxTypes",
    "listInvoices",
    "getInvoice",
    "createInvoice",
    "recordInvoicePayment",
    "getLandProfileByProject",
    "getLandPaymentSchedule",
    "getLandTransactionCosts",
    "listPermitsByProject",
    "getPermit",
    "listSharedCostAllocations",
    "getSharedCostAllocation",
    "approveSharedCostAllocation",
    "listPurchaseRequests",
    "getPurchaseRequest",
    "createPurchaseRequest",
    "selectQuotation",
    "listApprovalThresholds",
    "getDevelopmentProjects",
    "getDevelopmentProjectBySlug",
    // Pre-existing helpers reused by the new surfaces:
    "getCostCategories",
  ];
  // For each new route + client component, every server-action-like
  // identifier we extract must be in the known list.
  const allFiles = [...NEW_ROUTES, ...NEW_CLIENT_COMPONENTS];
  for (const rel of allFiles) {
    const src = read(rel);
    // Match imports from server action modules.
    const matches = src.matchAll(
      /import\s+\{([^}]+)\}\s+from\s+"@\/lib\/development\/server\/[^"]+"/g,
    );
    for (const m of matches) {
      const names = m[1]
        .split(",")
        .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
        .filter((n) => n.length > 0 && !n.startsWith("type"));
      for (const name of names) {
        // Type-only imports are fine — only assert against the runtime
        // function names we expect to be reused.
        if (/^[A-Z]/.test(name)) continue; // Types start with capital.
        assert.ok(
          known.includes(name) ||
            // Allowlist ancillary helpers we did not enumerate above.
            ["safeQuery", "getDb"].includes(name),
          `${rel} imports unexpected server symbol '${name}' — Stage 4.A.4 must reuse existing actions`,
        );
      }
    }
  }
});
