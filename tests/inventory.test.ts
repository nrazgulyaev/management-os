/**
 * Pure-logic smoke tests for v5: inventory codes, stock math, procurement
 * transitions, attachment helpers, checklist enforcement, permissions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration 0006 shape
// -----------------------------------------------------------------------------
test("migration 0006 declares all v5 tables + task_attachments columns", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0006_inventory_procurement_attachments.sql"),
    "utf8",
  );
  for (const t of [
    "suppliers",
    "inventory_locations",
    "inventory_categories",
    "inventory_items",
    "inventory_stock_levels",
    "inventory_movements",
    "task_material_usage",
    "purchase_requests",
    "purchase_request_lines",
    "purchase_orders",
    "purchase_order_lines",
    "inventory_counts",
    "inventory_count_lines",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
  assert.match(sql, /storage_bucket/);
  assert.match(sql, /storage_path/);
  assert.match(sql, /upload_status/);
  assert.match(sql, /signed_url_expires_at/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

// -----------------------------------------------------------------------------
// Inventory codes
// -----------------------------------------------------------------------------
test("inventory codes follow PREFIX-YYYYMMDD-NNNN format", async () => {
  const { buildMovementCode, buildCountCode, isInventoryCode } = await import(
    "../src/features/inventory/codes"
  );
  const d = new Date(Date.UTC(2026, 4, 1));
  assert.equal(buildMovementCode(7, d), "MV-20260501-0007");
  assert.equal(buildCountCode(1, d), "CNT-20260501-0001");
  assert.equal(isInventoryCode("MV-20260501-0007"), true);
  assert.equal(isInventoryCode("MV-2026-0007"), false);
});

test("procurement codes follow PR-/PO-YYYYMMDD format", async () => {
  const { buildPurchaseRequestCode, buildPurchaseOrderCode } = await import(
    "../src/features/procurement/codes"
  );
  const d = new Date(Date.UTC(2026, 4, 1));
  assert.equal(buildPurchaseRequestCode(1, d), "PR-20260501-0001");
  assert.equal(buildPurchaseOrderCode(42, d), "PO-20260501-0042");
});

// -----------------------------------------------------------------------------
// Stock movement math
// -----------------------------------------------------------------------------
test("stock deltas are correct per movement type", async () => {
  const { deltasFor } = await import("../src/features/inventory/stock");
  assert.deepEqual(deltasFor("receive", 10), { fromDelta: 0, toDelta: 10 });
  assert.deepEqual(deltasFor("consume", 4), { fromDelta: -4, toDelta: 0 });
  assert.deepEqual(deltasFor("transfer", 5), { fromDelta: -5, toDelta: 5 });
  assert.deepEqual(deltasFor("damage", 2), { fromDelta: -2, toDelta: 0 });
  assert.deepEqual(deltasFor("write_off", 3), { fromDelta: -3, toDelta: 0 });
  assert.deepEqual(deltasFor("return_to_supplier", 1), { fromDelta: -1, toDelta: 0 });
  assert.deepEqual(deltasFor("adjust", -2), { fromDelta: 0, toDelta: -2 });
  assert.deepEqual(deltasFor("count_correction", 7), { fromDelta: 0, toDelta: 7 });
});

test("validateMovementShape rejects misuse + accepts legal forms", async () => {
  const { validateMovementShape } = await import("../src/features/inventory/stock");
  // Receive needs to_location.
  assert.match(
    validateMovementShape({
      type: "receive",
      quantity: 5,
      fromLocationId: null,
      toLocationId: null,
    })!,
    /to_location/,
  );
  // Consume needs from_location.
  assert.match(
    validateMovementShape({
      type: "consume",
      quantity: 5,
      fromLocationId: null,
      toLocationId: null,
    })!,
    /from_location/,
  );
  // Transfer must have distinct locations.
  assert.match(
    validateMovementShape({
      type: "transfer",
      quantity: 5,
      fromLocationId: "loc-a",
      toLocationId: "loc-a",
    })!,
    /different/,
  );
  // Quantity must be > 0 for unsigned types.
  assert.match(
    validateMovementShape({
      type: "consume",
      quantity: 0,
      fromLocationId: "loc-a",
      toLocationId: null,
    })!,
    />\s*0/,
  );
  // Adjust must be non-zero.
  assert.match(
    validateMovementShape({
      type: "adjust",
      quantity: 0,
      fromLocationId: null,
      toLocationId: "loc-a",
    })!,
    /non-zero/,
  );
  // Happy path
  assert.equal(
    validateMovementShape({
      type: "transfer",
      quantity: 5,
      fromLocationId: "a",
      toLocationId: "b",
    }),
    null,
  );
});

test("wouldGoNegative refuses to drop stock below zero unless allowed", async () => {
  const { wouldGoNegative } = await import("../src/features/inventory/stock");
  assert.equal(
    wouldGoNegative(3, { fromDelta: -5, toDelta: 0 }, false),
    true,
  );
  assert.equal(
    wouldGoNegative(3, { fromDelta: -5, toDelta: 0 }, true),
    false,
  );
  assert.equal(
    wouldGoNegative(10, { fromDelta: -2, toDelta: 0 }, false),
    false,
  );
});

test("isLowStock crosses the reorder threshold inclusive", async () => {
  const { isLowStock } = await import("../src/features/inventory/stock");
  assert.equal(isLowStock(5, 10), true);
  assert.equal(isLowStock(10, 10), true);
  assert.equal(isLowStock(11, 10), false);
  assert.equal(isLowStock(0, null), false); // no reorder point set
});

// -----------------------------------------------------------------------------
// Procurement transitions
// -----------------------------------------------------------------------------
test("purchase request transitions enforce the lifecycle", async () => {
  const { PR_TRANSITIONS, canTransition } = await import(
    "../src/features/procurement/schema"
  );
  assert.equal(canTransition(PR_TRANSITIONS, "draft", "submitted"), true);
  assert.equal(canTransition(PR_TRANSITIONS, "submitted", "approved"), true);
  assert.equal(canTransition(PR_TRANSITIONS, "approved", "ordered"), true);
  assert.equal(canTransition(PR_TRANSITIONS, "ordered", "draft"), false);
  assert.equal(canTransition(PR_TRANSITIONS, "rejected", "draft"), true);
});

test("purchase order transitions enforce the lifecycle", async () => {
  const { PO_TRANSITIONS, canTransition } = await import(
    "../src/features/procurement/schema"
  );
  assert.equal(canTransition(PO_TRANSITIONS, "draft", "sent"), true);
  assert.equal(canTransition(PO_TRANSITIONS, "sent", "partially_received"), true);
  assert.equal(canTransition(PO_TRANSITIONS, "partially_received", "received"), true);
  assert.equal(canTransition(PO_TRANSITIONS, "received", "draft"), false);
  assert.equal(canTransition(PO_TRANSITIONS, "cancelled", "sent"), false);
});

// -----------------------------------------------------------------------------
// Attachment validators
// -----------------------------------------------------------------------------
test("sanitizeFilename strips dangerous characters and clamps length", async () => {
  const { sanitizeFilename } = await import("../src/features/attachments/schema");
  assert.equal(sanitizeFilename("photo from phone.JPG"), "photo-from-phone.jpg");
  // Path traversal — only the basename survives.
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  // Hidden-style prefix: ".hidden" → ext="hidden", base falls back to "file".
  assert.equal(sanitizeFilename("..hidden"), "file.hidden");
  assert.equal(sanitizeFilename("file with    spaces.png"), "file-with-spaces.png");
  // Non-extension-bearing input falls back to "file".
  assert.equal(sanitizeFilename(""), "file");
});

test("requestSignedUploadSchema rejects unsupported mime types", async () => {
  const { requestSignedUploadSchema } = await import("../src/features/attachments/schema");
  const bad = requestSignedUploadSchema.safeParse({
    target: "task",
    targetId: "00000000-0000-0000-0000-000000000001",
    fileName: "evil.exe",
    mimeType: "application/octet-stream",
    sizeBytes: 1024,
  });
  assert.equal(bad.success, false);

  const good = requestSignedUploadSchema.safeParse({
    target: "task",
    targetId: "00000000-0000-0000-0000-000000000001",
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
  });
  assert.equal(good.success, true);
});

test("requestSignedUploadSchema enforces 10MB cap", async () => {
  const { requestSignedUploadSchema, MAX_FILE_BYTES } = await import(
    "../src/features/attachments/schema"
  );
  const tooBig = requestSignedUploadSchema.safeParse({
    target: "task",
    targetId: "00000000-0000-0000-0000-000000000001",
    fileName: "big.jpg",
    mimeType: "image/jpeg",
    sizeBytes: MAX_FILE_BYTES + 1,
  });
  assert.equal(tooBig.success, false);
});

// -----------------------------------------------------------------------------
// Checklist photo_required enforcement
// -----------------------------------------------------------------------------
test("evaluateChecklistReadiness blocks done+photo_required without attachment", async () => {
  const { evaluateChecklistReadiness } = await import(
    "../src/features/operations/checklists"
  );
  const blocked = evaluateChecklistReadiness([
    { status: "done", isRequired: true, photoRequired: true, hasAttachment: false },
    { status: "done", isRequired: true, photoRequired: false },
  ]);
  assert.equal(blocked.canComplete, false);
  assert.match(blocked.blockers.join(" "), /photo required/);

  const ok = evaluateChecklistReadiness([
    { status: "done", isRequired: true, photoRequired: true, hasAttachment: true },
    { status: "done", isRequired: true, photoRequired: false },
  ]);
  assert.equal(ok.canComplete, true);
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix gates inventory + procurement + attachments correctly", async () => {
  const { hasPermission } = await import("../src/features/auth/permission-matrix");
  const baseUser = {
    mode: "live" as const,
    appUser: { id: "u", email: "x@x", fullName: "X", status: "active", organizationId: "00000000-0000-0000-0000-000000000000" },
    roles: [] as ("housekeeper" | "technician" | "procurement_manager" | "concierge")[],
    isInternal: true,
    isSuperAdmin: false,
  };
  const housekeeper = { ...baseUser, roles: ["housekeeper" as const] };
  const technician = { ...baseUser, roles: ["technician" as const] };
  const procurement = { ...baseUser, roles: ["procurement_manager" as const] };
  const concierge = { ...baseUser, roles: ["concierge" as const] };

  assert.equal(hasPermission(housekeeper, "inventory.read"), true);
  assert.equal(hasPermission(housekeeper, "inventory.write"), true);
  assert.equal(hasPermission(housekeeper, "inventory.adjust"), false);
  assert.equal(hasPermission(housekeeper, "attachments.write"), true);

  assert.equal(hasPermission(technician, "inventory.write"), true);
  assert.equal(hasPermission(technician, "procurement.write"), false);

  assert.equal(hasPermission(procurement, "procurement.write"), true);
  assert.equal(hasPermission(procurement, "procurement.approve"), true);
  assert.equal(hasPermission(procurement, "inventory.adjust"), true);

  assert.equal(hasPermission(concierge, "attachments.write"), true);
  assert.equal(hasPermission(concierge, "inventory.write"), false);
});
