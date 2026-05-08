/**
 * Stage 10.E.1 — Inventory CRUD rollout acceptance tests.
 *
 * The audit found 5 inventory pages with Add but no Edit / Delete:
 *   /dashboard/inventory                (overview — no list to edit)
 *   /dashboard/inventory/items
 *   /dashboard/inventory/locations
 *   /dashboard/inventory/movements      (event-sourced — out of scope)
 *   /dashboard/inventory/suppliers
 *
 * 10.E.1 closes the gap on suppliers / locations / categories / items
 * by adding update + archive server actions, wiring a reusable
 * `<InventoryRowActions>` client wrapper into each list page, and
 * defaulting empty states to the new `<NoItemsYet>` primitive.
 *
 * Movements are intentionally NOT touched — they're event-sourced
 * (reverse via counter-movement, never edit).
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

const ACTIONS = "src/features/inventory/actions.ts";
const WRAPPER = "src/components/dashboard/inventory/inventory-row-actions.tsx";

// ============================================================================
// Server actions: 4 update + 4 archive
// ============================================================================

test("10.E.1: 4 update server actions exported", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "updateSupplierAction",
    "updateInventoryLocationAction",
    "updateInventoryCategoryAction",
    "updateInventoryItemAction",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("10.E.1: 4 archive server actions exported", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "archiveSupplierAction",
    "archiveInventoryLocationAction",
    "archiveInventoryCategoryAction",
    "archiveInventoryItemAction",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("10.E.1: archive actions perform soft-delete (status -> 'archived'), no hard DELETE", () => {
  const src = read(ACTIONS);
  // No DELETE FROM patterns introduced for the 4 entities — soft delete only.
  // Each archive function should set status: "archived".
  const archiveBodies = src.match(
    /export async function archive\w+Action[\s\S]*?return \{ ok: true \};/g,
  );
  assert.ok(archiveBodies && archiveBodies.length === 4, "expected 4 archive bodies");
  for (const body of archiveBodies) {
    assert.match(body, /status:\s*"archived"/);
    assert.match(body, /recordAuditEvent/);
  }
});

test("10.E.1: every update action validates with the corresponding zod schema", () => {
  const src = read(ACTIONS);
  for (const [fn, schema] of [
    ["updateSupplierAction", "createSupplierSchema"],
    ["updateInventoryLocationAction", "createInventoryLocationSchema"],
    ["updateInventoryCategoryAction", "createInventoryCategorySchema"],
    ["updateInventoryItemAction", "createInventoryItemSchema"],
  ]) {
    const re = new RegExp(
      `export async function ${fn}\\b[\\s\\S]*?${schema}\\.safeParse`,
    );
    assert.match(src, re, `${fn} must call ${schema}.safeParse`);
  }
});

test("10.E.1: every update action gates on requirePermission", () => {
  const src = read(ACTIONS);
  const perPage: Record<string, RegExp> = {
    updateSupplierAction: /procurement\.write/,
    updateInventoryLocationAction: /inventory\.write/,
    updateInventoryCategoryAction: /inventory\.write/,
    updateInventoryItemAction: /inventory\.write/,
    archiveSupplierAction: /procurement\.write/,
    archiveInventoryLocationAction: /inventory\.write/,
    archiveInventoryCategoryAction: /inventory\.write/,
    archiveInventoryItemAction: /inventory\.write/,
  };
  for (const [fn, perm] of Object.entries(perPage)) {
    const body = src.match(
      new RegExp(`export async function ${fn}\\b[\\s\\S]*?(?=export async|$)`),
    )?.[0];
    assert.ok(body, `${fn} body not found`);
    assert.match(body!, /requirePermission\(/);
    assert.match(body!, perm, `${fn} must require permission matching ${perm}`);
  }
});

test("10.E.1: every update + archive action revalidates the right list path", () => {
  const src = read(ACTIONS);
  const expected: Record<string, string> = {
    updateSupplierAction: "/dashboard/inventory/suppliers",
    archiveSupplierAction: "/dashboard/inventory/suppliers",
    updateInventoryLocationAction: "/dashboard/inventory/locations",
    archiveInventoryLocationAction: "/dashboard/inventory/locations",
    updateInventoryCategoryAction: "/dashboard/inventory/categories",
    archiveInventoryCategoryAction: "/dashboard/inventory/categories",
    updateInventoryItemAction: "/dashboard/inventory/items",
    archiveInventoryItemAction: "/dashboard/inventory/items",
  };
  for (const [fn, path] of Object.entries(expected)) {
    const body = src.match(
      new RegExp(`export async function ${fn}\\b[\\s\\S]*?(?=export async|$)`),
    )?.[0];
    assert.ok(body, `${fn} body not found`);
    assert.match(
      body!,
      new RegExp(`revalidatePath\\("${path.replace(/[/]/g, "\\/")}"\\)`),
      `${fn} must revalidatePath ${path}`,
    );
  }
});

test("10.E.1: each update action audit-logs the right action key", () => {
  const src = read(ACTIONS);
  for (const key of [
    "inventory.supplier.update",
    "inventory.location.update",
    "inventory.category.update",
    "inventory.item.update",
    "inventory.supplier.archive",
    "inventory.location.archive",
    "inventory.category.archive",
    "inventory.item.archive",
  ]) {
    assert.ok(
      src.includes(`"${key}"`),
      `audit action key ${key} must appear in actions file`,
    );
  }
});

test("10.E.1: archive actions return early with not-found error when row missing", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "archiveSupplierAction",
    "archiveInventoryLocationAction",
    "archiveInventoryCategoryAction",
    "archiveInventoryItemAction",
  ]) {
    const body = src.match(
      new RegExp(`export async function ${fn}\\b[\\s\\S]*?(?=export async|$)`),
    )?.[0];
    assert.ok(body);
    assert.match(body!, /if \(!row\)\s*return \{\s*ok:\s*false/);
  }
});

// ============================================================================
// Client wrapper
// ============================================================================

test("10.E.1: InventoryRowActions wrapper exists + is a client component", () => {
  assert.ok(exists(WRAPPER));
  const src = read(WRAPPER);
  assert.match(src, /^"use client"/m);
});

test("10.E.1: wrapper imports the 4 update + 4 archive server actions", () => {
  const src = read(WRAPPER);
  for (const fn of [
    "updateSupplierAction",
    "updateInventoryLocationAction",
    "updateInventoryCategoryAction",
    "updateInventoryItemAction",
    "archiveSupplierAction",
    "archiveInventoryLocationAction",
    "archiveInventoryCategoryAction",
    "archiveInventoryItemAction",
  ]) {
    assert.ok(src.includes(fn), `wrapper must import ${fn}`);
  }
});

test("10.E.1: wrapper composes RowActionsMenu + EntityFormModal + ArchiveConfirmDialog", () => {
  const src = read(WRAPPER);
  assert.match(src, /RowActionsMenu/);
  assert.match(src, /EntityFormModal/);
  assert.match(src, /ArchiveConfirmDialog/);
});

test("10.E.1: wrapper handles 4 entity kinds via discriminated `kind` prop", () => {
  const src = read(WRAPPER);
  assert.match(src, /InventoryEntityKind\s*=\s*"supplier"\s*\|\s*"location"\s*\|\s*"category"\s*\|\s*"item"/);
});

test("10.E.1: wrapper category form disables the immutable `key` field", () => {
  const src = read(WRAPPER);
  // key field must have disabled: true (it's the stable identifier for the category).
  assert.match(
    src,
    /name:\s*"key"[\s\S]{0,200}disabled:\s*true/,
  );
});

test("10.E.1: wrapper Archive action uses the danger tone (destructive styling)", () => {
  const src = read(WRAPPER);
  // The archive RowAction should be tone: "danger" so the menu surfaces it
  // distinctly from the neutral Edit action.
  assert.match(src, /id:\s*"archive"[\s\S]{0,200}tone:\s*"danger"/);
});

// ============================================================================
// Page wiring
// ============================================================================

const PAGES: Array<{
  path: string;
  kind: "supplier" | "location" | "category" | "item";
}> = [
  { path: "src/app/(dashboard)/dashboard/inventory/suppliers/page.tsx", kind: "supplier" },
  { path: "src/app/(dashboard)/dashboard/inventory/locations/page.tsx", kind: "location" },
  { path: "src/app/(dashboard)/dashboard/inventory/categories/page.tsx", kind: "category" },
  { path: "src/app/(dashboard)/dashboard/inventory/items/page.tsx", kind: "item" },
];

test("10.E.1: each list page imports InventoryRowActions", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      /import\s*\{\s*InventoryRowActions\s*\}\s*from\s*"@\/components\/dashboard\/inventory\/inventory-row-actions"/,
      `${p.path} missing InventoryRowActions import`,
    );
  }
});

test("10.E.1: each list page uses NoItemsYet for the empty state", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      /import\s*\{[^}]*NoItemsYet[^}]*\}\s*from\s*"@\/components\/ui\/primitives"/,
      `${p.path} missing NoItemsYet import`,
    );
    assert.match(src, /<NoItemsYet/, `${p.path} must render <NoItemsYet>`);
  }
});

test("10.E.1: each list page renders InventoryRowActions with the correct `kind`", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`<InventoryRowActions[\\s\\S]{0,400}kind="${p.kind}"`),
      `${p.path} must render <InventoryRowActions kind="${p.kind}">`,
    );
  }
});

test("10.E.1: each list page table preserves the original column count + adds an actions column", () => {
  // Suppliers: original 6 cols + 1 actions = 7. Locations: 4 + 1 = 5.
  // Categories: 5 + 1 = 6. Items uses card grid, not table.
  const supplierSrc = read(PAGES[0]!.path);
  assert.match(supplierSrc, /<TR><TH>Name<\/TH><TH>Type<\/TH><TH>Email<\/TH><TH>Phone<\/TH><TH>Country<\/TH><TH>Status<\/TH><TH \/><\/TR>/);
  const locationSrc = read(PAGES[1]!.path);
  assert.match(locationSrc, /<TR><TH>Name<\/TH><TH>Type<\/TH><TH>Linked to<\/TH><TH>Status<\/TH><TH \/><\/TR>/);
  const categorySrc = read(PAGES[2]!.path);
  assert.match(
    categorySrc,
    /<TR><TH>Name<\/TH><TH>Key<\/TH><TH>Default unit<\/TH><TH>Consumable<\/TH><TH>Status<\/TH><TH \/><\/TR>/,
  );
});

test("10.E.1: items page wraps each card in a relative div with the actions menu in the corner", () => {
  const src = read(PAGES[3]!.path);
  // The card-grid layout gets the actions absolutely-positioned to avoid
  // nesting a button inside the link.
  assert.match(src, /<div\s+key=\{i\.id\}\s+className="relative">/);
  assert.match(src, /absolute top-3 right-3 z-10/);
});

// ============================================================================
// Phase 10.E.1 closure
// ============================================================================

test("Phase 10.E.1: decisions doc shipped", () => {
  assert.ok(exists("tmp/stage-10-e-1-decisions.md"));
});
