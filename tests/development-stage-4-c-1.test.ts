/**
 * Stage 4.C.1 — QA/QC + Warehouse / Inventory tests.
 *
 * Mix of runtime tests on pure helpers (qa-qc-helpers, stock-balance-helpers)
 * and static-source tests on schema, migration, server modules, UI routes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isValidQaQcTransition,
  assertValidQaQcTransition,
  QA_QC_VALID_TRANSITIONS,
  computeVillaSeverityScore,
  type QaQcStatus,
} from "../src/lib/development/server/qa-qc/qa-qc-helpers";
import {
  applyMovementToBalance,
  projectMovements,
} from "../src/lib/development/server/inventory/stock-balance-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0051 = "drizzle/0051_development_os_stage_4_c_1_quality_warehouse.sql";

// ===========================================================================
// 1) Migration 0051 — shape
// ===========================================================================

test("migration 0051 file exists and wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0051));
  const sql = read(MIG_0051);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0051 creates 4 QA/QC tables", () => {
  const sql = read(MIG_0051);
  for (const t of [
    "qa_qc_categories",
    "qa_qc_issues",
    "qa_qc_inspections",
    "qa_qc_issue_photos",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `${t} create missing`,
    );
  }
});

test("migration 0051 namespaces inventory tables with dev_os_ prefix (Management OS conflict avoidance)", () => {
  const sql = read(MIG_0051);
  for (const t of [
    "dev_os_inventory_items",
    "dev_os_inventory_locations",
    "dev_os_inventory_stock_balances",
    "dev_os_inventory_movements",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `${t} create missing`,
    );
  }
  // Should NOT create the un-prefixed names that conflict with Management OS.
  assert.doesNotMatch(
    sql,
    /CREATE TABLE IF NOT EXISTS "inventory_items"/,
  );
});

test("migration 0051 qa_qc_issues has all 7 lifecycle statuses", () => {
  const sql = read(MIG_0051);
  for (const s of [
    "open",
    "assigned",
    "in_progress",
    "ready_for_reinspection",
    "rejected",
    "accepted",
    "closed",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `status '${s}' missing`);
  }
});

test("migration 0051 qa_qc_issues has all 4 severity levels", () => {
  const sql = read(MIG_0051);
  for (const s of ["low", "medium", "high", "critical"]) {
    assert.ok(sql.includes(`'${s}'`), `severity '${s}' missing`);
  }
});

test("migration 0051 qa_qc_inspections enforces UNIQUE(issue, inspection_number)", () => {
  const sql = read(MIG_0051);
  assert.match(sql, /UNIQUE \("issue_id", "inspection_number"\)/);
});

test("migration 0051 qa_qc_issue_photos covers all 4 photo roles", () => {
  const sql = read(MIG_0051);
  for (const r of [
    "initial_defect",
    "work_in_progress",
    "resolution_proof",
    "reinspection",
  ]) {
    assert.ok(sql.includes(`'${r}'`), `photo_role '${r}' missing`);
  }
});

test("migration 0051 dev_os_inventory_movements covers all 11 movement types", () => {
  const sql = read(MIG_0051);
  for (const t of [
    "received",
    "reserved",
    "unreserved",
    "issued_to_site",
    "used",
    "returned",
    "damaged",
    "lost",
    "transferred",
    "written_off",
    "adjusted",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `movement_type '${t}' missing`);
  }
});

test("migration 0051 dev_os_inventory_locations covers all 6 location types", () => {
  const sql = read(MIG_0051);
  for (const t of [
    "warehouse",
    "site",
    "in_transit",
    "consumed",
    "damaged",
    "returned",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `location_type '${t}' missing`);
  }
});

test("migration 0051 stock_balances has CHECK quantity_on_hand >= 0 (defense in depth)", () => {
  const sql = read(MIG_0051);
  assert.match(sql, /"quantity_on_hand"[\s\S]{0,80}CHECK \("quantity_on_hand" >= 0\)/);
});

test("migration 0051 stock_balances quantity_available is GENERATED STORED", () => {
  const sql = read(MIG_0051);
  assert.match(
    sql,
    /"quantity_available" NUMERIC\(14,4\) GENERATED ALWAYS AS \(\s*"quantity_on_hand" - "quantity_reserved"\s*\) STORED/,
  );
});

test("migration 0051 stock_balances enforces UNIQUE(item, location)", () => {
  const sql = read(MIG_0051);
  assert.match(sql, /UNIQUE \("item_id", "location_id"\)/);
});

test("migration 0051 inventory_movements quantity must be > 0 (CHECK)", () => {
  const sql = read(MIG_0051);
  assert.match(sql, /"quantity"[\s\S]{0,80}CHECK \("quantity" > 0\)/);
});

test("migration 0051 RLS protects all 8 new tables", () => {
  const sql = read(MIG_0051);
  for (const t of [
    "qa_qc_categories",
    "qa_qc_issues",
    "qa_qc_inspections",
    "qa_qc_issue_photos",
    "dev_os_inventory_items",
    "dev_os_inventory_locations",
    "dev_os_inventory_stock_balances",
    "dev_os_inventory_movements",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /public\.is_internal_user\(\)/);
});

test("migration 0051 seeds default qa_qc_categories (idempotent)", () => {
  const sql = read(MIG_0051);
  assert.match(sql, /INSERT INTO "qa_qc_categories"/);
  assert.match(sql, /ON CONFLICT \(category_key\) DO NOTHING/);
  assert.ok(sql.includes("'structural'"));
  assert.ok(sql.includes("'mep_electrical'"));
  assert.ok(sql.includes("'finishing_microcement'"));
});

// ===========================================================================
// 2) Schema files
// ===========================================================================

test("Stage 4.C.1 schema files exist + re-exported from index", () => {
  assert.ok(exists("src/lib/db/schema/qa-qc.ts"));
  assert.ok(exists("src/lib/db/schema/dev-os-inventory.ts"));
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/qa-qc";/);
  assert.match(idx, /export \* from "\.\/dev-os-inventory";/);
});

// ===========================================================================
// 3) qa-qc-helpers — pure lifecycle tests
// ===========================================================================

test("qa-qc: open → assigned is valid", () => {
  assert.equal(isValidQaQcTransition("open", "assigned"), true);
});

test("qa-qc: open → closed is valid (force-close for duplicates)", () => {
  assert.equal(isValidQaQcTransition("open", "closed"), true);
});

test("qa-qc: open → in_progress is INVALID (must assign first)", () => {
  assert.equal(isValidQaQcTransition("open", "in_progress"), false);
});

test("qa-qc: open → accepted is INVALID (cannot skip workflow)", () => {
  assert.equal(isValidQaQcTransition("open", "accepted"), false);
});

test("qa-qc: in_progress → ready_for_reinspection is valid", () => {
  assert.equal(
    isValidQaQcTransition("in_progress", "ready_for_reinspection"),
    true,
  );
});

test("qa-qc: ready_for_reinspection → accepted/rejected both valid", () => {
  assert.equal(
    isValidQaQcTransition("ready_for_reinspection", "accepted"),
    true,
  );
  assert.equal(
    isValidQaQcTransition("ready_for_reinspection", "rejected"),
    true,
  );
});

test("qa-qc: rejected → in_progress (rework loop) is the only valid transition from rejected", () => {
  assert.equal(isValidQaQcTransition("rejected", "in_progress"), true);
  assert.equal(isValidQaQcTransition("rejected", "accepted"), false);
  assert.equal(isValidQaQcTransition("rejected", "closed"), false);
});

test("qa-qc: accepted → closed is valid; reverse closed → accepted is INVALID", () => {
  assert.equal(isValidQaQcTransition("accepted", "closed"), true);
  assert.equal(isValidQaQcTransition("closed", "accepted"), false);
});

test("qa-qc: closed has zero outbound transitions (terminal)", () => {
  assert.deepEqual(QA_QC_VALID_TRANSITIONS.closed, []);
});

test("qa-qc: assertValidQaQcTransition throws on invalid transition", () => {
  assert.throws(() => assertValidQaQcTransition("open", "in_progress"));
  assert.doesNotThrow(() => assertValidQaQcTransition("open", "assigned"));
});

test("qa-qc: computeVillaSeverityScore aggregates only open issues", () => {
  const issues: Array<{
    villaId: string | null;
    severity: "low" | "medium" | "high" | "critical";
    status: QaQcStatus;
  }> = [
    { villaId: "v1", severity: "high", status: "in_progress" }, // counted = 3
    { villaId: "v1", severity: "critical", status: "open" }, // counted = 4
    { villaId: "v1", severity: "low", status: "accepted" }, // skipped (accepted)
    { villaId: "v1", severity: "medium", status: "closed" }, // skipped (closed)
    { villaId: "v2", severity: "critical", status: "open" }, // wrong villa
  ];
  assert.equal(computeVillaSeverityScore(issues, "v1"), 7);
  assert.equal(computeVillaSeverityScore(issues, "v2"), 4);
});

// ===========================================================================
// 4) stock-balance-helpers — pure movement math
// ===========================================================================

test("stock: 'received' credits the to-location only", () => {
  const d = applyMovementToBalance({
    movementType: "received",
    quantity: 50,
    fromLocationId: null,
    toLocationId: "wh-1",
  });
  assert.equal(d.creditLocationId, "wh-1");
  assert.equal(d.debitLocationId, null);
  assert.equal(d.quantity, 50);
});

test("stock: 'received' rejects without toLocationId", () => {
  assert.throws(() =>
    applyMovementToBalance({
      movementType: "received",
      quantity: 50,
      fromLocationId: null,
      toLocationId: null,
    }),
  );
});

test("stock: 'transferred' debits from + credits to (atomic pair)", () => {
  const d = applyMovementToBalance({
    movementType: "transferred",
    quantity: 30,
    fromLocationId: "wh-1",
    toLocationId: "site-eternal",
  });
  assert.equal(d.debitLocationId, "wh-1");
  assert.equal(d.creditLocationId, "site-eternal");
  assert.equal(d.quantity, 30);
});

test("stock: 'used' debits from-location only (out of system)", () => {
  const d = applyMovementToBalance({
    movementType: "used",
    quantity: 10,
    fromLocationId: "site-eternal",
    toLocationId: null,
  });
  assert.equal(d.debitLocationId, "site-eternal");
  assert.equal(d.creditLocationId, null);
});

test("stock: 'reserved' touches reserved bucket only (no on_hand change)", () => {
  const d = applyMovementToBalance({
    movementType: "reserved",
    quantity: 5,
    fromLocationId: null,
    toLocationId: "wh-1",
  });
  assert.equal(d.affectsReserved, true);
  assert.equal(d.reservedDelta, 5);
  assert.equal(d.quantity, 0); // no on_hand change
});

test("stock: 'unreserved' decreases reserved bucket", () => {
  const d = applyMovementToBalance({
    movementType: "unreserved",
    quantity: 5,
    fromLocationId: null,
    toLocationId: "wh-1",
  });
  assert.equal(d.affectsReserved, true);
  assert.equal(d.reservedDelta, -5);
});

test("stock: rejects negative or zero quantity", () => {
  assert.throws(() =>
    applyMovementToBalance({
      movementType: "received",
      quantity: 0,
      fromLocationId: null,
      toLocationId: "wh-1",
    }),
  );
  assert.throws(() =>
    applyMovementToBalance({
      movementType: "received",
      quantity: -5,
      fromLocationId: null,
      toLocationId: "wh-1",
    }),
  );
});

test("stock: projectMovements applies sequence correctly", () => {
  const final = projectMovements(new Map([["item1:wh-1", 100]]), [
    {
      itemId: "item1",
      movementType: "issued_to_site",
      quantity: 20,
      fromLocationId: "wh-1",
      toLocationId: "site-eternal",
    },
    {
      itemId: "item1",
      movementType: "used",
      quantity: 15,
      fromLocationId: "site-eternal",
      toLocationId: null,
    },
  ]);
  assert.equal(final.get("item1:wh-1"), 80);
  assert.equal(final.get("item1:site-eternal"), 5);
});

test("stock: projectMovements refuses to drive negative", () => {
  assert.throws(() =>
    projectMovements(new Map([["item1:wh-1", 5]]), [
      {
        itemId: "item1",
        movementType: "issued_to_site",
        quantity: 10,
        fromLocationId: "wh-1",
        toLocationId: "site-eternal",
      },
    ]),
  );
});

// ===========================================================================
// 5) Server modules — files exist + use server-only
// ===========================================================================

test("Stage 4.C.1 server modules exist + use server-only (except pure helpers)", () => {
  for (const rel of [
    "src/lib/development/server/qa-qc/qa-qc-queries.ts",
    "src/lib/development/server/qa-qc/qa-qc-actions.ts",
    "src/lib/development/server/inventory/inventory-queries.ts",
    "src/lib/development/server/inventory/inventory-actions.ts",
  ]) {
    assert.ok(exists(rel), `missing ${rel}`);
    const src = read(rel);
    assert.match(src, /^import "server-only"/m, `${rel} missing server-only`);
  }
});

test("qa-qc-helpers.ts is PURE (no server-only import, no DB)", () => {
  const src = read("src/lib/development/server/qa-qc/qa-qc-helpers.ts");
  assert.doesNotMatch(src, /^import\s+"server-only"/m);
  assert.doesNotMatch(src, /requireDb|drizzle-orm/);
});

test("stock-balance-helpers.ts is PURE", () => {
  const src = read(
    "src/lib/development/server/inventory/stock-balance-helpers.ts",
  );
  assert.doesNotMatch(src, /^import\s+"server-only"/m);
  assert.doesNotMatch(src, /requireDb|drizzle-orm/);
});

test("inventory-actions: wraps movement + balance update in db.transaction", () => {
  const src = read(
    "src/lib/development/server/inventory/inventory-actions.ts",
  );
  assert.match(src, /db\.transaction/);
});

test("inventory-actions: refuses to drive on_hand negative (pre-check)", () => {
  const src = read(
    "src/lib/development/server/inventory/inventory-actions.ts",
  );
  assert.match(src, /insufficient stock/);
});

test("inventory-actions: auto-generates INV-YYYY-#### codes", () => {
  const src = read(
    "src/lib/development/server/inventory/inventory-actions.ts",
  );
  assert.match(src, /INV-\$\{year\}-\$\{seq\}/);
});

test("qa-qc-actions: auto-generates QC-YYYY-#### codes", () => {
  const src = read("src/lib/development/server/qa-qc/qa-qc-actions.ts");
  assert.match(src, /QC-\$\{year\}-\$\{seq\}/);
});

test("qa-qc-actions: recordQaQcInspection refuses when status != ready_for_reinspection", () => {
  const src = read("src/lib/development/server/qa-qc/qa-qc-actions.ts");
  assert.match(src, /can only inspect issues in 'ready_for_reinspection'/);
});

test("qa-qc-actions: inspection auto-transitions issue (passed→accepted, failed→rejected)", () => {
  const src = read("src/lib/development/server/qa-qc/qa-qc-actions.ts");
  assert.match(src, /parsed\.result === "passed"/);
  assert.match(src, /accepted/);
  assert.match(src, /rejected/);
});

// ===========================================================================
// 6) UI routes — QA/QC + Inventory (REQUIRED, no deferral)
// ===========================================================================

const QA_QC_ROUTES = [
  "src/app/(development-app)/development-os/qa-qc/page.tsx",
  "src/app/(development-app)/development-os/qa-qc/[code]/page.tsx",
  "src/app/(development-app)/development-os/qa-qc/[code]/inspect/page.tsx",
  "src/app/(development-app)/development-os/qa-qc/new/page.tsx",
];

const INVENTORY_ROUTES = [
  "src/app/(development-app)/development-os/inventory/page.tsx",
  "src/app/(development-app)/development-os/inventory/items/page.tsx",
  "src/app/(development-app)/development-os/inventory/items/[sku]/page.tsx",
  "src/app/(development-app)/development-os/inventory/items/new/page.tsx",
  "src/app/(development-app)/development-os/inventory/locations/page.tsx",
  "src/app/(development-app)/development-os/inventory/movements/page.tsx",
  "src/app/(development-app)/development-os/inventory/movements/new/page.tsx",
  "src/app/(development-app)/development-os/inventory/stocktake/page.tsx",
];

test("QA/QC: list + detail + create + inspect routes all exist", () => {
  for (const rel of QA_QC_ROUTES) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("Inventory: items + locations + movements + stocktake routes all exist", () => {
  for (const rel of INVENTORY_ROUTES) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("All Stage 4.C.1 UI routes wrap in DevelopmentShell + force-dynamic", () => {
  for (const rel of [...QA_QC_ROUTES, ...INVENTORY_ROUTES]) {
    const src = read(rel);
    if (rel.endsWith("inventory/page.tsx")) continue; // redirect-only
    assert.match(src, /DevelopmentShell/, `${rel} missing DevelopmentShell`);
    assert.match(src, /force-dynamic/, `${rel} missing force-dynamic`);
  }
});

test("QA/QC create form is mobile-friendly (44px+ touch targets, single-column on phone)", () => {
  const src = read("src/components/development/qa-qc/qa-qc-create-form.tsx");
  assert.match(src, /min-h-\[44px\]/);
  assert.match(src, /grid-cols-1.*md:grid-cols-/);
});

test("QA/QC create form uses 4 severity buttons (touch-large)", () => {
  const src = read("src/components/development/qa-qc/qa-qc-create-form.tsx");
  for (const s of ["low", "medium", "high", "critical"]) {
    assert.ok(src.includes(`"${s}"`));
  }
});

test("QA/QC transition actions client component drives off pure helper transition table", () => {
  // Defense in depth: UI + action + helper all aligned.
  const src = read(
    "src/components/development/qa-qc/qa-qc-transition-actions.tsx",
  );
  assert.match(src, /QA_QC_VALID_TRANSITIONS/);
});

test("QA/QC inspection form uses 3 result buttons (passed/failed/partial_pass)", () => {
  const src = read(
    "src/components/development/qa-qc/qa-qc-inspection-form.tsx",
  );
  for (const r of ["passed", "failed", "partial_pass"]) {
    assert.ok(src.includes(`"${r}"`));
  }
});

test("Inventory movement form is mobile-friendly (44px+ touch targets)", () => {
  const src = read("src/components/development/inventory/movement-form.tsx");
  assert.match(src, /min-h-\[44px\]/);
});

test("Inventory movement form covers required movement types", () => {
  const src = read("src/components/development/inventory/movement-form.tsx");
  for (const t of [
    "received",
    "issued_to_site",
    "used",
    "transferred",
    "damaged",
  ]) {
    assert.ok(src.includes(`"${t}"`));
  }
});

test("All Stage 4.C.1 client components carry 'use client' + useTransition", () => {
  for (const rel of [
    "src/components/development/qa-qc/qa-qc-create-form.tsx",
    "src/components/development/qa-qc/qa-qc-transition-actions.tsx",
    "src/components/development/qa-qc/qa-qc-inspection-form.tsx",
    "src/components/development/inventory/inventory-item-form.tsx",
    "src/components/development/inventory/movement-form.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /^"use client"/m, `${rel} missing 'use client'`);
    assert.match(src, /useTransition/, `${rel} missing useTransition`);
  }
});

test("Stage 4.C.1 list pages route through safeQuery for resilience", () => {
  for (const rel of [
    "src/app/(development-app)/development-os/qa-qc/page.tsx",
    "src/app/(development-app)/development-os/inventory/items/page.tsx",
    "src/app/(development-app)/development-os/inventory/locations/page.tsx",
    "src/app/(development-app)/development-os/inventory/movements/page.tsx",
    "src/app/(development-app)/development-os/inventory/stocktake/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /safeQuery/, `${rel} missing safeQuery`);
  }
});
