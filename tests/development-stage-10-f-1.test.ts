/**
 * Stage 10.F.1 — Modal-First Add Forms (Mgmt OS) acceptance tests.
 *
 * 5 list pages converted from `<Link href="/new">` page-nav Add to
 * <EntityFormModal>-driven Add via the new add-button companions:
 *
 *   /dashboard/inventory/suppliers              → <AddSupplierButton>
 *   /dashboard/inventory/locations              → <AddInventoryLocationButton>
 *   /dashboard/inventory/items                  → <AddInventoryItemButton>
 *   /dashboard/owner-stays/policies             → <AddOwnerStayPolicyButton>
 *   /dashboard/owner-stays/equivalence-groups   → <AddEquivalenceGroupButton>
 *
 * Calendar-feeds deferred — needs villa-picker typeahead (see
 * docs/stage-10-modal-pattern.md "When to defer").
 *
 * No new server actions in 10.F (per pattern-guide rule); all Add
 * buttons re-use the existing `create*Action` from each feature.
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

const INVENTORY_BUTTONS = "src/components/dashboard/inventory/inventory-add-buttons.tsx";
const OWNERS_BUTTONS = "src/components/dashboard/owners/owners-add-buttons.tsx";

// ============================================================================
// Add-button components
// ============================================================================

test("10.F.1: inventory-add-buttons file exists + is a client component", () => {
  assert.ok(exists(INVENTORY_BUTTONS));
  const src = read(INVENTORY_BUTTONS);
  assert.match(src, /^"use client"/m);
});

test("10.F.1: inventory exports AddSupplierButton + AddInventoryLocationButton + AddInventoryItemButton", () => {
  const src = read(INVENTORY_BUTTONS);
  for (const fn of [
    "AddSupplierButton",
    "AddInventoryLocationButton",
    "AddInventoryItemButton",
  ]) {
    assert.match(src, new RegExp(`export function ${fn}\\b`));
  }
});

test("10.F.1: inventory buttons import from primitives barrel + use EntityFormModal", () => {
  const src = read(INVENTORY_BUTTONS);
  assert.match(src, /from\s+"@\/components\/ui\/primitives"/);
  assert.match(src, /<EntityFormModal/);
});

test("10.F.1: inventory buttons re-use existing create actions (no new server-side code)", () => {
  const src = read(INVENTORY_BUTTONS);
  for (const fn of [
    "createSupplierAction",
    "createInventoryLocationAction",
    "createInventoryItemAction",
  ]) {
    assert.match(src, new RegExp(`\\b${fn}\\b`));
    assert.ok(
      src.includes(`@/features/inventory/actions`),
      "imports must come from the feature actions module",
    );
  }
});

test("10.F.1: inventory buttons set sensible initialValues (default selects + units)", () => {
  const src = read(INVENTORY_BUTTONS);
  // Each Add button passes initialValues for the required select / unit
  // fields so the operator doesn't hit "required" on every field.
  assert.match(src, /supplierType:\s*"general"/);
  assert.match(src, /locationType:\s*"warehouse"/);
  assert.match(src, /itemType:\s*"consumable"[\s\S]{0,40}unit:\s*"pcs"/);
});

test("10.F.1: owners-add-buttons file exists + is a client component", () => {
  assert.ok(exists(OWNERS_BUTTONS));
  const src = read(OWNERS_BUTTONS);
  assert.match(src, /^"use client"/m);
});

test("10.F.1: owners exports AddOwnerStayPolicyButton + AddEquivalenceGroupButton", () => {
  const src = read(OWNERS_BUTTONS);
  for (const fn of ["AddOwnerStayPolicyButton", "AddEquivalenceGroupButton"]) {
    assert.match(src, new RegExp(`export function ${fn}\\b`));
  }
});

test("10.F.1: owners buttons re-use createOwnerStayPolicyAction + createEquivalenceGroupAction", () => {
  const src = read(OWNERS_BUTTONS);
  assert.match(src, /createOwnerStayPolicyAction/);
  assert.match(src, /createEquivalenceGroupAction/);
  assert.match(src, /from\s+"@\/features\/owner-stays\/actions"/);
});

test("10.F.1: every add-button calls router.refresh() on success (NOT router.push)", () => {
  for (const path of [INVENTORY_BUTTONS, OWNERS_BUTTONS]) {
    const src = read(path);
    assert.match(src, /router\.refresh\(\)/);
    // The pattern-guide rule: don't navigate away. Verify push is not
    // used in any Add submit handler (it can appear elsewhere in the
    // file legitimately, but should not in the modal-Add flow).
    assert.ok(
      !/onSubmit[\s\S]{0,200}router\.push\(/.test(src),
      `${path} must use router.refresh() in onSubmit, not router.push()`,
    );
  }
});

test("10.F.1: add buttons throw on action failure (lets EntityFormModal surface inline error)", () => {
  for (const path of [INVENTORY_BUTTONS, OWNERS_BUTTONS]) {
    const src = read(path);
    // Pattern: `if (!res.ok) throw new Error(res.error ?? ...)`
    assert.match(
      src,
      /if \(!res\.ok\)\s*throw new Error/,
      `${path} must throw on !res.ok so EntityFormModal surfaces error`,
    );
  }
});

// ============================================================================
// Page wiring — 5 list pages
// ============================================================================

const PAGES: Array<{
  path: string;
  buttonName: string;
}> = [
  {
    path: "src/app/(dashboard)/dashboard/inventory/suppliers/page.tsx",
    buttonName: "AddSupplierButton",
  },
  {
    path: "src/app/(dashboard)/dashboard/inventory/locations/page.tsx",
    buttonName: "AddInventoryLocationButton",
  },
  {
    path: "src/app/(dashboard)/dashboard/inventory/items/page.tsx",
    buttonName: "AddInventoryItemButton",
  },
  {
    path: "src/app/(dashboard)/dashboard/owner-stays/policies/page.tsx",
    buttonName: "AddOwnerStayPolicyButton",
  },
  {
    path: "src/app/(dashboard)/dashboard/owner-stays/equivalence-groups/page.tsx",
    buttonName: "AddEquivalenceGroupButton",
  },
];

test("10.F.1: each page imports its Add button from the correct module", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`import\\s*\\{\\s*${p.buttonName}\\s*\\}`),
      `${p.path} must import ${p.buttonName}`,
    );
  }
});

test("10.F.1: each page renders the Add button in the page header", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`actions=\\{<${p.buttonName}\\b`),
      `${p.path} must render <${p.buttonName}> in PageHeader actions slot`,
    );
  }
});

test("10.F.1: each page passes the Add button into NoItemsYet via addAction", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`addAction=\\{<${p.buttonName}\\b`),
      `${p.path} must pass <${p.buttonName}> into NoItemsYet's addAction slot`,
    );
  }
});

test("10.F.1: each page no longer imports Link from next/link OR Plus from lucide for the bare-Add pattern", () => {
  // The bare-Add pattern was: <Link><Button><Plus />New X</Button></Link>.
  // After conversion, the page should not import Link solely for the
  // new-Add link. (Link may legitimately appear elsewhere, e.g. for
  // detail-page nav.) We check that the specific anchor pattern is gone.
  for (const p of PAGES) {
    const src = read(p.path);
    assert.ok(
      !/<Link\s+href="\/dashboard\/[^"]*\/new"[\s\S]{0,200}<Plus\b/.test(src),
      `${p.path} must not retain the <Link href="/new"><Plus></Link> pattern`,
    );
  }
});

test("10.F.1: /new pages stay alive as deep-link fallback (not deleted)", () => {
  // The pattern guide mandates keeping /new pages — bookmarks + bulk
  // import + external doc links rely on them. Verify they exist.
  for (const url of [
    "src/app/(dashboard)/dashboard/inventory/suppliers/new/page.tsx",
    "src/app/(dashboard)/dashboard/inventory/locations/new/page.tsx",
    "src/app/(dashboard)/dashboard/inventory/items/new/page.tsx",
    "src/app/(dashboard)/dashboard/owner-stays/policies/new/page.tsx",
    "src/app/(dashboard)/dashboard/owner-stays/equivalence-groups/new/page.tsx",
  ]) {
    assert.ok(exists(url), `${url} must remain as deep-link fallback`);
  }
});

// ============================================================================
// Pattern guide doc
// ============================================================================

test("10.F.1: pattern guide doc shipped", () => {
  assert.ok(exists("docs/stage-10-modal-pattern.md"));
  const src = read("docs/stage-10-modal-pattern.md");
  // Must cover: convention, when-to-use, when-to-defer, don'ts.
  assert.match(src, /When to use the modal pattern/);
  assert.match(src, /When to defer/);
  assert.match(src, /Don'ts/);
  assert.match(src, /AddSupplierButton/);
});

test("10.F.1: pattern guide documents calendar-feeds deferral with reason", () => {
  const src = read("docs/stage-10-modal-pattern.md");
  assert.match(src, /calendar-feeds/i);
  assert.match(src, /typeahead|villa picker/i);
});

// ============================================================================
// Phase 10.F.1 closure
// ============================================================================

test("Phase 10.F.1: decisions doc shipped", () => {
  assert.ok(exists("tmp/stage-10-f-1-decisions.md"));
});
