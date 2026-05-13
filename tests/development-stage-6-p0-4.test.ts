/**
 * Stage 6.P0.4 — Finance Forms tests.
 *
 * Verifies the 4 new modal forms (transaction, cost-category,
 * bank-account, vendor), the FinanceTabs nav strip, the action
 * `"use server"` flips required for client-import, and the wiring
 * of triggers onto the 5 finance list pages.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const FINANCE_TABS = "src/components/development/finance/finance-tabs.tsx";
const COST_CAT_FORM = "src/components/development/finance/cost-category-modal-form.tsx";
const BANK_ACC_FORM = "src/components/development/finance/bank-account-modal-form.tsx";
const TX_FORM = "src/components/development/finance/transaction-modal-form.tsx";
const VENDOR_FORM = "src/components/development/finance/vendor-modal-form.tsx";

const FINANCE_PAGE = "src/app/(development-app)/development-os/finance/page.tsx";
const TX_PAGE = "src/app/(development-app)/development-os/finance/transactions/page.tsx";
const INV_PAGE = "src/app/(development-app)/development-os/finance/invoices/page.tsx";
const CAT_PAGE = "src/app/(development-app)/development-os/finance/categories/page.tsx";
const BANK_PAGE = "src/app/(development-app)/development-os/finance/bank-accounts/page.tsx";
const VENDORS_PAGE = "src/app/(development-app)/development-os/vendors/page.tsx";

const TX_ACTIONS = "src/lib/development/server/transaction-actions.ts";
const COST_CAT_ACTIONS = "src/lib/development/server/cost-category-actions.ts";
const BANK_ACC_ACTIONS = "src/lib/development/server/bank-account-actions.ts";
const VENDOR_ACTIONS = "src/lib/development/server/vendor-actions.ts";

// ===========================================================================
// 1) FinanceTabs nav
// ===========================================================================

test("FinanceTabs file exists + is a client component", () => {
  assert.ok(exists(FINANCE_TABS));
  assert.match(read(FINANCE_TABS), /^"use client";/m);
});

test("FinanceTabs declares all 6 tabs (Reports + 5 entity tabs)", () => {
  const src = read(FINANCE_TABS);
  for (const label of [
    "Reports",
    "Transactions",
    "Invoices",
    "Vendors",
    "Cost categories",
    "Bank accounts",
  ]) {
    assert.match(src, new RegExp(`label:\\s*"${label.replace(/ /g, "\\s")}"`));
  }
});

test("FinanceTabs Vendors tab links to /development-os/vendors (top-level, not under /finance)", () => {
  const src = read(FINANCE_TABS);
  assert.match(src, /href:\s*"\/development-os\/vendors"/);
});

test("FinanceTabs uses usePathname for active-state detection", () => {
  const src = read(FINANCE_TABS);
  assert.match(src, /usePathname/);
  // Reports tab is active only on exact /finance match (not on every descendant)
  assert.match(src, /pathname === "\/development-os\/finance"/);
});

test("FinanceTabs is mobile-friendly (overflow-x-auto, 44px touch targets)", () => {
  const src = read(FINANCE_TABS);
  assert.match(src, /overflow-x-auto/);
  assert.match(src, /min-h-\[44px\]/);
});

test("FinanceTabs carries data-testid hooks for each tab", () => {
  const src = read(FINANCE_TABS);
  // Top-level testid for the nav itself
  assert.match(src, /data-testid="finance-tabs"/);
  // Per-tab testid is built dynamically from the `key` field; verify
  // every expected key exists in the TABS array AND the testid template
  // expression interpolates `t.key`.
  for (const key of [
    "reports",
    "transactions",
    "invoices",
    "vendors",
    "categories",
    "bank-accounts",
  ]) {
    assert.match(src, new RegExp(`key:\\s*"${key}"`));
  }
  assert.match(src, /data-testid=\{`finance-tab-\$\{t\.key\}`\}/);
});

// ===========================================================================
// 2) Action files flipped to "use server" (client-importable)
// ===========================================================================

for (const path of [TX_ACTIONS, COST_CAT_ACTIONS, BANK_ACC_ACTIONS, VENDOR_ACTIONS]) {
  test(`Action file ${path} carries "use server" directive (P0.4 flip)`, () => {
    assert.match(read(path), /^"use server";/m);
  });
  test(`Action file ${path} no longer carries import "server-only"`, () => {
    assert.doesNotMatch(read(path), /^import\s+"server-only"/m);
  });
}

// ===========================================================================
// 3) Cost category modal form
// ===========================================================================

test("CostCategoryModalForm file exists + is a client component", () => {
  assert.ok(exists(COST_CAT_FORM));
  assert.match(read(COST_CAT_FORM), /^"use client";/m);
});

test("CostCategoryModalForm imports createCostCategory action + EntityModal", () => {
  const src = read(COST_CAT_FORM);
  assert.match(src, /import\s+\{\s*createCostCategory\s*\}/);
  assert.match(src, /import\s+\{\s*EntityModal\s*\}/);
});

test("CostCategoryModalForm uses workflow-verb label 'Add cost category' (Q2)", () => {
  const src = read(COST_CAT_FORM);
  // Trigger button label
  assert.match(src, /Add cost category/);
});

test("CostCategoryModalForm enumerates the 7 valid category types", () => {
  const src = read(COST_CAT_FORM);
  for (const t of [
    "capex",
    "opex",
    "cogs",
    "fee_income",
    "sale_income",
    "rental_income",
    "corporate_event",
  ]) {
    assert.match(src, new RegExp(`value: "${t}"`));
  }
});

test("CostCategoryModalForm carries data-testid trigger hook", () => {
  assert.match(read(COST_CAT_FORM), /data-testid="cost-category-add-trigger"/);
});

// ===========================================================================
// 4) Bank account modal form
// ===========================================================================

test("BankAccountModalForm file exists + is a client component", () => {
  assert.ok(exists(BANK_ACC_FORM));
  assert.match(read(BANK_ACC_FORM), /^"use client";/m);
});

test("BankAccountModalForm imports createBankAccount + EntityModal", () => {
  const src = read(BANK_ACC_FORM);
  assert.match(src, /import\s+\{\s*createBankAccount\s*\}/);
  assert.match(src, /import\s+\{\s*EntityModal\s*\}/);
});

test("BankAccountModalForm enumerates the 4 account types", () => {
  const src = read(BANK_ACC_FORM);
  for (const t of ["bank", "crypto_exchange", "crypto_wallet", "cash"]) {
    assert.match(src, new RegExp(`value: "${t}"`));
  }
});

test("BankAccountModalForm enumerates the 6 supported currencies", () => {
  const src = read(BANK_ACC_FORM);
  // Match the array literal, tolerant to whitespace
  assert.match(src, /USD/);
  assert.match(src, /IDR/);
  assert.match(src, /USDT/);
});

test("BankAccountModalForm uses workflow-verb label 'Add bank account'", () => {
  assert.match(read(BANK_ACC_FORM), /Add bank account/);
});

test("BankAccountModalForm collapses bank-specific + crypto-specific fields under <details>", () => {
  const src = read(BANK_ACC_FORM);
  // Two collapsed sections: Bank details + Crypto wallet details
  const detailsCount = (src.match(/<details/g) ?? []).length;
  assert.ok(
    detailsCount >= 2,
    `expected ≥2 <details> blocks for bank vs crypto field grouping, found ${detailsCount}`,
  );
});

// ===========================================================================
// 5) Transaction modal form
// ===========================================================================

test("TransactionModalForm file exists + is a client component", () => {
  assert.ok(exists(TX_FORM));
  assert.match(read(TX_FORM), /^"use client";/m);
});

test("TransactionModalForm imports recordTransaction action (workflow verb)", () => {
  const src = read(TX_FORM);
  assert.match(src, /import\s+\{\s*recordTransaction\s*\}/);
});

test("TransactionModalForm uses workflow-verb label 'Record transaction' (NOT 'Add transaction')", () => {
  const src = read(TX_FORM);
  assert.match(src, /Record transaction/);
  assert.doesNotMatch(src, /Add transaction/);
});

test("TransactionModalForm offers all 3 directions", () => {
  const src = read(TX_FORM);
  for (const d of ["inflow", "outflow", "internal_transfer"]) {
    assert.match(src, new RegExp(`value: "${d}"`));
  }
});

test("TransactionModalForm offers all 3 allocation types", () => {
  const src = read(TX_FORM);
  for (const a of ["single_project", "multi_project", "company_overhead"]) {
    assert.match(src, new RegExp(`value: "${a}"`));
  }
});

test("TransactionModalForm collapses advanced fields under <details>", () => {
  const src = read(TX_FORM);
  assert.match(src, /<details/);
  assert.match(src, /Advanced/);
});

test("TransactionModalForm validates positive amount before submit", () => {
  const src = read(TX_FORM);
  assert.match(src, /Amount must be a positive number/);
});

test("TransactionModalForm converts major→minor units (cents) for the action", () => {
  const src = read(TX_FORM);
  assert.match(src, /amountMajor \* 100/);
});

test("TransactionModalForm defaults transaction date to today", () => {
  const src = read(TX_FORM);
  assert.match(src, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

test("TransactionModalForm defaults FX rate to 1.0 (sane for USD accounts)", () => {
  const src = read(TX_FORM);
  assert.match(src, /defaultValue="1\.0"/);
});

// ===========================================================================
// 6) Vendor modal form
// ===========================================================================

test("VendorModalForm file exists + is a client component", () => {
  assert.ok(exists(VENDOR_FORM));
  assert.match(read(VENDOR_FORM), /^"use client";/m);
});

test("VendorModalForm imports createVendor + EntityModal", () => {
  const src = read(VENDOR_FORM);
  assert.match(src, /import\s+\{\s*createVendor\s*\}/);
  assert.match(src, /import\s+\{\s*EntityModal\s*\}/);
});

test("VendorModalForm uses workflow-verb label 'Add vendor'", () => {
  assert.match(read(VENDOR_FORM), /Add vendor/);
});

test("VendorModalForm offers domain-appropriate vendor types", () => {
  const src = read(VENDOR_FORM);
  for (const t of [
    "contractor",
    "subcontractor",
    "supplier",
    "consultant",
    "professional_service",
    "government_body",
    "utility",
  ]) {
    assert.match(src, new RegExp(`value: "${t}"`));
  }
});

test("VendorModalForm groups contact / compliance / bank fields in <details> sections", () => {
  const src = read(VENDOR_FORM);
  const detailsCount = (src.match(/<details/g) ?? []).length;
  assert.ok(
    detailsCount >= 3,
    `expected ≥3 collapsible sections (contact, compliance, bank), found ${detailsCount}`,
  );
});

test("VendorModalForm uses correct mobile input types (tel for phone, email for email, date for licence expiry)", () => {
  const src = read(VENDOR_FORM);
  assert.match(src, /type="email"/);
  assert.match(src, /type="tel"/);
  assert.match(src, /type="date"/);
});

// ===========================================================================
// 7) List page wiring
// ===========================================================================

test("Cost categories page mounts FinanceTabs + CostCategoryModalForm", () => {
  const src = read(CAT_PAGE);
  assert.match(src, /<FinanceTabs/);
  assert.match(src, /<CostCategoryModalForm/);
  assert.match(src, /import\s+\{\s*FinanceTabs\s*\}/);
  assert.match(src, /import\s+\{\s*CostCategoryModalForm\s*\}/);
});

test("Bank accounts page mounts FinanceTabs + BankAccountModalForm + fetches projects", () => {
  const src = read(BANK_PAGE);
  assert.match(src, /<FinanceTabs/);
  assert.match(src, /<BankAccountModalForm/);
  assert.match(src, /getDevelopmentProjects/);
});

test("Transactions page mounts FinanceTabs + TransactionModalForm + fetches all 3 dependent lists", () => {
  const src = read(TX_PAGE);
  assert.match(src, /<FinanceTabs/);
  assert.match(src, /<TransactionModalForm/);
  // Three select-source lists fetched: bank accounts + cost categories + projects
  assert.match(src, /getCostCategories/);
  assert.match(src, /getDevelopmentProjects/);
});

test("Invoices page mounts FinanceTabs (10.6.C.2.3 migrated to modal Add with /new deep-link fallback)", () => {
  const src = read(INV_PAGE);
  assert.match(src, /<FinanceTabs/);
  // 10.6.C.2.3 replaced the inline "New invoice" link with InvoiceAddButton
  // (a ModalFirstAddButton wrapper). The /new route is preserved via the
  // wrapper's newRouteHref prop as a deep-link fallback, so external
  // bookmarks still work.
  assert.match(src, /<InvoiceAddButton/);
});

test("Vendors page mounts FinanceTabs + VendorModalForm + retains 'Detailed form' link to /vendors/new", () => {
  const src = read(VENDORS_PAGE);
  assert.match(src, /<FinanceTabs/);
  assert.match(src, /<VendorModalForm/);
  assert.match(src, /Detailed form/);
});

test("Parent /finance page mounts FinanceTabs (Reports tab landing)", () => {
  const src = read(FINANCE_PAGE);
  assert.match(src, /<FinanceTabs/);
});

// ===========================================================================
// 8) Audit doc kept in sync with P0.4 work
// ===========================================================================

test("audit doc Q2 decision (/finance tabbed hub) is documented", () => {
  const md = read("docs/STAGE-6-P0-AUDIT.md");
  assert.match(md, /Sub-tabs of `\/finance`/);
});

// ===========================================================================
// 9) Stage 5.J build-fix invariant preserved
// ===========================================================================

test("Stage 5.J build-fix invariant: client forms do NOT import server-only", () => {
  for (const f of [COST_CAT_FORM, BANK_ACC_FORM, TX_FORM, VENDOR_FORM]) {
    assert.doesNotMatch(
      read(f),
      /^import\s+"server-only"/m,
      `${f} is a client component and must not import server-only`,
    );
  }
});

// ===========================================================================
// 10) Action files retain their schema validation + DB writes
// ===========================================================================

test("recordTransaction still uses zod parse + drizzle insert", () => {
  const src = read(TX_ACTIONS);
  assert.match(src, /recordTransactionSchema\.parse/);
  // drizzle chain spans multiple lines; collapse whitespace
  const flat = src.replace(/\s+/g, " ");
  assert.match(flat, /\.insert\(devTransactions\)/);
});

test("createCostCategory still uses zod parse + drizzle insert", () => {
  const src = read(COST_CAT_ACTIONS);
  assert.match(src, /createSchema\.parse/);
  assert.match(src, /devCostCategories/);
});

test("createBankAccount still uses zod parse + drizzle insert", () => {
  const src = read(BANK_ACC_ACTIONS);
  assert.match(src, /createSchema\.parse/);
  assert.match(src, /devBankAccounts/);
});

test("createVendor still uses zod parse + drizzle insert", () => {
  const src = read(VENDOR_ACTIONS);
  assert.match(src, /vendorCreateSchema\.parse/);
  const flat = src.replace(/\s+/g, " ");
  assert.match(flat, /\.insert\(vendors\)/);
});

// ===========================================================================
// 11) No new dependencies in P0.4
// ===========================================================================

test("P0.4 introduces no new package.json dependencies", () => {
  const pkg = JSON.parse(read("package.json"));
  const all = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  for (const f of ["sonner", "react-hot-toast", "@headlessui/react", "react-aria"]) {
    assert.equal(
      f in all,
      false,
      `P0.4 must not add ${f} — modal/toast story unchanged from P0.3`,
    );
  }
});

// ===========================================================================
// 12) router.refresh invocation present on each form (post-success refetch)
// ===========================================================================

for (const f of [COST_CAT_FORM, BANK_ACC_FORM, TX_FORM, VENDOR_FORM]) {
  test(`${f} calls router.refresh() on successful submit`, () => {
    const src = read(f);
    assert.match(src, /router\.refresh\(\)/);
    assert.match(src, /useRouter/);
  });
}

// ===========================================================================
// 13) Each form uses useTransition for pending state
// ===========================================================================

for (const f of [COST_CAT_FORM, BANK_ACC_FORM, TX_FORM, VENDOR_FORM]) {
  test(`${f} uses useTransition for pending UI state`, () => {
    const src = read(f);
    assert.match(src, /useTransition/);
    assert.match(src, /startTransition/);
  });
}

// ===========================================================================
// 14) Each form renders error banner from action exception
// ===========================================================================

for (const f of [COST_CAT_FORM, BANK_ACC_FORM, TX_FORM, VENDOR_FORM]) {
  test(`${f} surfaces server-action errors inline (no toast dependency)`, () => {
    const src = read(f);
    assert.match(src, /catch \(e\)/);
    assert.match(src, /e instanceof Error/);
    assert.match(src, /setError/);
  });
}
