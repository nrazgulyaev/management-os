/**
 * Stage 10.E.6 — Dev-OS CRUD rollout acceptance tests.
 *
 * Wires Edit + Archive on 5 Dev-OS list pages flagged partial-CRUD by
 * the audit. Most actions existed; this sub-phase added 2 missing
 * pieces and built the shared <DevOsRowActions> wrapper to compose
 * them into a consistent menu UI.
 *
 * Pages wired:
 *   /development-os/vendors                 → kind="vendor"
 *   /development-os/marketing/lead-sources  → kind="lead_source"
 *   /development-os/finance/tax-types       → kind="tax_type"
 *   /development-os/asset-types             → kind="asset_type"
 *   /development-os/investors               → kind="investor"
 *
 * Cost categories deferred — page renders parent/child tree (different
 * shape than flat tables); already has CostCategoryArchiveButton.
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

const TAX_ACTIONS = "src/lib/development/server/tax/tax-actions.ts";
const LEAD_SRC_ACTIONS =
  "src/lib/development/server/lead-sources/lead-source-actions.ts";
const WRAPPER = "src/components/development/dev-os-row-actions.tsx";

// ============================================================================
// 2 new server actions
// ============================================================================

test("10.E.6: archiveTaxType shipped + soft-deletes via isActive", () => {
  const src = read(TAX_ACTIONS);
  assert.match(src, /export async function archiveTaxType\b/);
  // Match the full function body up to the next export/const declaration.
  // The signature has nested braces ({ id: string }) so we can't naively
  // stop at the first '}'.
  const body = src.match(
    /export async function archiveTaxType\b[\s\S]*?(?=\nexport |\nconst )/,
  )?.[0];
  assert.ok(body);
  assert.match(body!, /isActive:\s*false/);
  assert.match(body!, /requireInternalUser/);
});

test("10.E.6: updateLeadSource shipped + omits sourceKey (immutable)", () => {
  const src = read(LEAD_SRC_ACTIONS);
  assert.match(src, /export async function updateLeadSource\b/);
  // updateSchema must omit sourceKey since it's the entity identifier.
  assert.match(
    src,
    /const\s+updateSchema\s*=\s*createSchema\.omit\(\{\s*sourceKey:\s*true\s*\}\)/,
  );
  // Function takes sourceKey as a separate arg, then a typed input.
  assert.match(
    src,
    /export async function updateLeadSource\(\s*sourceKey:\s*string,\s*input:/,
  );
});

test("10.E.6: existing dev-os actions intact (regression guard)", () => {
  const sec = read("src/lib/development/server/vendor-actions.ts");
  for (const fn of ["createVendor", "updateVendor", "setVendorStatus"]) {
    assert.match(sec, new RegExp(`export async function ${fn}\\b`));
  }
  const inv = read("src/lib/development/server/investor-actions.ts");
  for (const fn of ["createInvestor", "updateInvestor", "setInvestorStatus"]) {
    assert.match(inv, new RegExp(`export async function ${fn}\\b`));
  }
  const cat = read("src/lib/development/server/cost-category-actions.ts");
  for (const fn of [
    "createCostCategory",
    "updateCostCategory",
    "deactivateCostCategory",
  ]) {
    assert.match(cat, new RegExp(`export async function ${fn}\\b`));
  }
  const at = read("src/lib/development/server/assets/asset-type-actions.ts");
  for (const fn of [
    "createAssetType",
    "updateAssetType",
    "deactivateAssetType",
  ]) {
    assert.match(at, new RegExp(`export async function ${fn}\\b`));
  }
});

// ============================================================================
// Client wrapper
// ============================================================================

test("10.E.6: DevOsRowActions wrapper exists + is a client component", () => {
  assert.ok(exists(WRAPPER));
  const src = read(WRAPPER);
  assert.match(src, /^"use client"/m);
});

test("10.E.6: wrapper handles 6 entity kinds", () => {
  const src = read(WRAPPER);
  assert.match(
    src,
    /DevOsEntityKind\s*=\s*\|?\s*"vendor"\s*\|\s*"investor"\s*\|\s*"lead_source"\s*\|\s*"cost_category"\s*\|\s*"tax_type"\s*\|\s*"asset_type"/,
  );
});

test("10.E.6: wrapper imports all 12 typed actions across 6 features", () => {
  const src = read(WRAPPER);
  for (const fn of [
    "updateVendor",
    "setVendorStatus",
    "updateInvestor",
    "setInvestorStatus",
    "updateLeadSource",
    "deactivateLeadSource",
    "updateCostCategory",
    "deactivateCostCategory",
    "upsertTaxType",
    "archiveTaxType",
    "updateAssetType",
    "deactivateAssetType",
  ]) {
    assert.ok(src.includes(fn), `wrapper must import ${fn}`);
  }
});

test("10.E.6: wrapper composes 10.D primitives", () => {
  const src = read(WRAPPER);
  assert.match(src, /RowActionsMenu/);
  assert.match(src, /EntityFormModal/);
  assert.match(src, /ArchiveConfirmDialog/);
});

test("10.E.6: wrapper coerces types per kind (lead_source.isPaid bool, tax.rate number)", () => {
  const src = read(WRAPPER);
  // FormData posts strings; typed actions need bool/number.
  assert.match(src, /coerced\.isPaid\s*=\s*Boolean\(merged\.isPaid\)/);
  assert.match(
    src,
    /coerced\.ratePercentage\s*=\s*Number\(merged\.ratePercentage\)/,
  );
  assert.match(
    src,
    /coerced\.isIncludedInAmount\s*=\s*Boolean\(merged\.isIncludedInAmount\)/,
  );
});

test("10.E.6: lead_source uses altId (sourceKey) for action calls", () => {
  const src = read(WRAPPER);
  // Lead source actions take sourceKey, not the row's UUID id.
  assert.match(
    src,
    /updateLeadSource\(\s*row\.altId\s*\?\?\s*row\.id/,
  );
  assert.match(
    src,
    /deactivateLeadSource\(row\.altId\s*\?\?\s*row\.id\)/,
  );
});

test("10.E.6: archive label adapts per kind (vendor=Blacklist, others=Deactivate/Archive)", () => {
  const src = read(WRAPPER);
  assert.match(src, /kind === "vendor"\s*\?\s*"Blacklist"/);
  assert.match(src, /\?\s*"Deactivate"/);
  assert.match(src, /:\s*"Archive"/);
});

test("10.E.6: cost_category + tax_type + asset_type lock their immutable key/typeKey", () => {
  const src = read(WRAPPER);
  // category `key` field disabled
  assert.match(src, /name:\s*"key"[\s\S]{0,200}disabled:\s*true/);
  // tax `typeKey` field disabled
  assert.match(src, /name:\s*"typeKey"[\s\S]{0,200}disabled:\s*true/);
});

// ============================================================================
// Page wiring
// ============================================================================

const PAGES: Array<{
  path: string;
  kind: "vendor" | "investor" | "lead_source" | "tax_type" | "asset_type";
}> = [
  {
    path: "src/app/(development-app)/development-os/vendors/page.tsx",
    kind: "vendor",
  },
  {
    path: "src/app/(development-app)/development-os/investors/page.tsx",
    kind: "investor",
  },
  {
    path: "src/app/(development-app)/development-os/marketing/lead-sources/page.tsx",
    kind: "lead_source",
  },
  {
    path: "src/app/(development-app)/development-os/finance/tax-types/page.tsx",
    kind: "tax_type",
  },
  {
    path: "src/app/(development-app)/development-os/asset-types/page.tsx",
    kind: "asset_type",
  },
];

test("10.E.6: each Dev-OS page imports DevOsRowActions", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      /import\s*\{\s*DevOsRowActions\s*\}\s*from\s*"@\/components\/development\/dev-os-row-actions"/,
      `${p.path} missing DevOsRowActions import`,
    );
  }
});

test("10.E.6: each page renders DevOsRowActions with correct `kind`", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`<DevOsRowActions[\\s\\S]{0,500}kind="${p.kind}"`),
      `${p.path} must render <DevOsRowActions kind="${p.kind}">`,
    );
  }
});

test("10.E.6: lead-sources page passes altId=sourceKey to wrapper", () => {
  const src = read(PAGES[2]!.path);
  assert.match(src, /altId:\s*s\.sourceKey/);
});

test("10.E.6: pages with NoItemsYet replace handwritten empty states", () => {
  // Vendors + tax-types + asset-types + lead-sources.
  for (const p of [PAGES[0]!, PAGES[2]!, PAGES[3]!, PAGES[4]!]) {
    const src = read(p.path);
    assert.match(src, /<NoItemsYet/, `${p.path} must use <NoItemsYet>`);
  }
});

// ============================================================================
// Phase 10.E.6 closure
// ============================================================================

test("Phase 10.E.6: decisions doc shipped + documents cost-categories deferral", () => {
  assert.ok(exists("tmp/stage-10-e-6-decisions.md"));
  const src = read("tmp/stage-10-e-6-decisions.md");
  assert.match(src, /cost.{0,3}categor/i);
  assert.match(src, /deferred|skipped|out of scope|follow-up/i);
});
