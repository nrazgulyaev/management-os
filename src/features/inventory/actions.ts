"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  inventoryCategories,
  inventoryItems,
  inventoryLocations,
  inventoryMovements,
  inventoryStockLevels,
  suppliers,
  taskMaterialUsage,
} from "@/lib/db/schema/inventory";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  createInventoryCategorySchema,
  createInventoryItemSchema,
  createInventoryLocationSchema,
  createMovementSchema,
  createSupplierSchema,
  taskMaterialUsageSchema,
} from "./schema";
import { buildMovementCode } from "./codes";
import {
  asNumber,
  deltasFor,
  validateMovementShape,
  wouldGoNegative,
  type MovementType,
} from "./stock";
import { nextMovementCounter } from "./services";
import type { ActionResult } from "@/features/projects/actions";

const emptyToNull = <T extends Record<string, unknown>>(o: T) => {
  const out: Record<string, unknown> = { ...o };
  for (const k of Object.keys(out)) if (out[k] === "") out[k] = null;
  return out;
};

// -----------------------------------------------------------------------------
// Suppliers / locations / categories / items
// -----------------------------------------------------------------------------

export async function createSupplierAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("procurement.write");
  const parsed = createSupplierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [row] = await db
    .insert(suppliers)
    .values(emptyToNull(parsed.data) as typeof suppliers.$inferInsert)
    .returning({ id: suppliers.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.supplier.create",
    entityType: "supplier",
    entityId: row.id,
    after: { name: parsed.data.name, supplierType: parsed.data.supplierType },
  });

  revalidatePath("/dashboard/inventory/suppliers");
  return { ok: true, redirectTo: "/dashboard/inventory/suppliers" };
}

export async function createInventoryLocationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const parsed = createInventoryLocationSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [row] = await db
    .insert(inventoryLocations)
    .values({
      name: parsed.data.name,
      locationType: parsed.data.locationType,
      description: parsed.data.description && parsed.data.description !== "" ? parsed.data.description : null,
      projectId: parsed.data.projectId ?? null,
      villaId: parsed.data.villaId ?? null,
    })
    .returning({ id: inventoryLocations.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.location.create",
    entityType: "inventory_location",
    entityId: row.id,
    after: { name: parsed.data.name, type: parsed.data.locationType },
  });
  revalidatePath("/dashboard/inventory/locations");
  return { ok: true, redirectTo: "/dashboard/inventory/locations" };
}

export async function createInventoryCategoryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const parsed = createInventoryCategorySchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [row] = await db
    .insert(inventoryCategories)
    .values({
      key: parsed.data.key,
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
      defaultUnit: parsed.data.defaultUnit,
      isConsumable: parsed.data.isConsumable,
    })
    .returning({ id: inventoryCategories.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.category.create",
    entityType: "inventory_category",
    entityId: row.id,
    after: { key: parsed.data.key, name: parsed.data.name },
  });
  revalidatePath("/dashboard/inventory/categories");
  return { ok: true, redirectTo: "/dashboard/inventory/categories" };
}

export async function createInventoryItemAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const parsed = createInventoryItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const d = parsed.data;
  const [row] = await db
    .insert(inventoryItems)
    .values({
      name: d.name,
      sku: d.sku && d.sku !== "" ? d.sku : null,
      categoryId: d.categoryId ?? null,
      defaultSupplierId: d.defaultSupplierId ?? null,
      unit: d.unit,
      itemType: d.itemType,
      description: d.description && d.description !== "" ? d.description : null,
      brand: d.brand && d.brand !== "" ? d.brand : null,
      model: d.model && d.model !== "" ? d.model : null,
      barcode: d.barcode && d.barcode !== "" ? d.barcode : null,
      reorderPoint: d.reorderPoint !== undefined ? String(d.reorderPoint) : null,
      reorderQuantity: d.reorderQuantity !== undefined ? String(d.reorderQuantity) : null,
      unitCostMinor: d.unitCostMinor ?? null,
      currency: d.currency && d.currency !== "" ? d.currency : null,
      ownerChargeable: d.ownerChargeable,
      trackSerial: d.trackSerial,
    })
    .returning({ id: inventoryItems.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.item.create",
    entityType: "inventory_item",
    entityId: row.id,
    after: { name: d.name, itemType: d.itemType, unit: d.unit },
  });

  revalidatePath("/dashboard/inventory/items");
  return { ok: true, redirectTo: `/dashboard/inventory/items/${row.id}` };
}

// -----------------------------------------------------------------------------
// Stage 10.E.1 — Update + archive (CRUD completeness rollout).
//
// Audit found `Add but no Edit/Delete` on inventory list pages. These
// actions close the gap. Archive is soft-delete (status -> "archived")
// — the schema's status text column already defaults to "active", so
// no migration needed.
// -----------------------------------------------------------------------------

interface IdActionInput {
  id: string;
}

// ---- Suppliers ----

export async function updateSupplierAction(
  input: IdActionInput,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("procurement.write");
  const parsed = createSupplierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(suppliers)
    .set(emptyToNull(parsed.data) as Partial<typeof suppliers.$inferInsert>)
    .where(eq(suppliers.id, input.id))
    .returning({ id: suppliers.id });
  if (!row) return { ok: false, error: "Supplier not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.supplier.update",
    entityType: "supplier",
    entityId: input.id,
    after: { name: parsed.data.name, supplierType: parsed.data.supplierType },
  });
  revalidatePath("/dashboard/inventory/suppliers");
  return { ok: true };
}

export async function archiveSupplierAction(input: IdActionInput): Promise<ActionResult> {
  await requirePermission("procurement.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(suppliers)
    .set({ status: "archived" })
    .where(eq(suppliers.id, input.id))
    .returning({ id: suppliers.id });
  if (!row) return { ok: false, error: "Supplier not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.supplier.archive",
    entityType: "supplier",
    entityId: input.id,
    after: { status: "archived" },
  });
  revalidatePath("/dashboard/inventory/suppliers");
  return { ok: true };
}

// ---- Inventory locations ----

export async function updateInventoryLocationAction(
  input: IdActionInput,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const parsed = createInventoryLocationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(inventoryLocations)
    .set(emptyToNull(parsed.data) as Partial<typeof inventoryLocations.$inferInsert>)
    .where(eq(inventoryLocations.id, input.id))
    .returning({ id: inventoryLocations.id });
  if (!row) return { ok: false, error: "Location not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.location.update",
    entityType: "inventory_location",
    entityId: input.id,
    after: { name: parsed.data.name, locationType: parsed.data.locationType },
  });
  revalidatePath("/dashboard/inventory/locations");
  return { ok: true };
}

export async function archiveInventoryLocationAction(input: IdActionInput): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(inventoryLocations)
    .set({ status: "archived" })
    .where(eq(inventoryLocations.id, input.id))
    .returning({ id: inventoryLocations.id });
  if (!row) return { ok: false, error: "Location not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.location.archive",
    entityType: "inventory_location",
    entityId: input.id,
    after: { status: "archived" },
  });
  revalidatePath("/dashboard/inventory/locations");
  return { ok: true };
}

// ---- Inventory categories ----

export async function updateInventoryCategoryAction(
  input: IdActionInput,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const parsed = createInventoryCategorySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(inventoryCategories)
    .set(emptyToNull(parsed.data) as Partial<typeof inventoryCategories.$inferInsert>)
    .where(eq(inventoryCategories.id, input.id))
    .returning({ id: inventoryCategories.id });
  if (!row) return { ok: false, error: "Category not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.category.update",
    entityType: "inventory_category",
    entityId: input.id,
    after: { name: parsed.data.name, key: parsed.data.key },
  });
  revalidatePath("/dashboard/inventory/categories");
  return { ok: true };
}

export async function archiveInventoryCategoryAction(input: IdActionInput): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(inventoryCategories)
    .set({ status: "archived" })
    .where(eq(inventoryCategories.id, input.id))
    .returning({ id: inventoryCategories.id });
  if (!row) return { ok: false, error: "Category not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.category.archive",
    entityType: "inventory_category",
    entityId: input.id,
    after: { status: "archived" },
  });
  revalidatePath("/dashboard/inventory/categories");
  return { ok: true };
}

// ---- Inventory items ----

export async function updateInventoryItemAction(
  input: IdActionInput,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const parsed = createInventoryItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;
  const [row] = await db
    .update(inventoryItems)
    .set({
      name: d.name,
      sku: d.sku && d.sku !== "" ? d.sku : null,
      categoryId: d.categoryId ?? null,
      defaultSupplierId: d.defaultSupplierId ?? null,
      unit: d.unit,
      itemType: d.itemType,
      description: d.description && d.description !== "" ? d.description : null,
      brand: d.brand && d.brand !== "" ? d.brand : null,
      model: d.model && d.model !== "" ? d.model : null,
      barcode: d.barcode && d.barcode !== "" ? d.barcode : null,
      reorderPoint: d.reorderPoint !== undefined ? String(d.reorderPoint) : null,
      reorderQuantity: d.reorderQuantity !== undefined ? String(d.reorderQuantity) : null,
      unitCostMinor: d.unitCostMinor ?? null,
      currency: d.currency && d.currency !== "" ? d.currency : null,
      ownerChargeable: d.ownerChargeable,
      trackSerial: d.trackSerial,
    })
    .where(eq(inventoryItems.id, input.id))
    .returning({ id: inventoryItems.id });
  if (!row) return { ok: false, error: "Item not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.item.update",
    entityType: "inventory_item",
    entityId: input.id,
    after: { name: d.name, itemType: d.itemType, unit: d.unit },
  });
  revalidatePath("/dashboard/inventory/items");
  return { ok: true };
}

export async function archiveInventoryItemAction(input: IdActionInput): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(inventoryItems)
    .set({ status: "archived" })
    .where(eq(inventoryItems.id, input.id))
    .returning({ id: inventoryItems.id });
  if (!row) return { ok: false, error: "Item not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.item.archive",
    entityType: "inventory_item",
    entityId: input.id,
    after: { status: "archived" },
  });
  revalidatePath("/dashboard/inventory/items");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Stock movement helpers
// -----------------------------------------------------------------------------

/**
 * Apply a stock movement transactionally: insert the movement row, upsert
 * the affected stock_levels, optionally check for negative stock. Returns
 * the new movement id or an error string.
 */
export async function applyMovement(input: {
  itemId: string;
  type: MovementType;
  quantity: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  reason?: string | null;
  taskId?: string | null;
  checklistItemId?: string | null;
  damageReportId?: string | null;
  purchaseOrderId?: string | null;
  unitCostMinor?: bigint | null;
  currency?: string | null;
  allowNegative?: boolean;
  actorUserId?: string | null;
}): Promise<{ movementId: string } | { error: string }> {
  const db = getDb();
  if (!db) return { error: "Database is not configured." };

  // TENANCY: every movement-mutating action funnels through here. Verify the
  // item + any referenced locations belong to the caller's org (a cross-org id
  // reads as not-found) and stamp the org on the movement. This single guard
  // covers create/receive/transfer/write-off/adjust/consume + count + PO
  // receipt, all of which call applyMovement.
  const organizationId = await requireOrgId();
  const [orgItem] = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.organizationId, organizationId)))
    .limit(1);
  if (!orgItem) return { error: "Item not found." };
  for (const locId of [input.fromLocationId, input.toLocationId]) {
    if (locId) {
      const [loc] = await db
        .select({ id: inventoryLocations.id })
        .from(inventoryLocations)
        .where(and(eq(inventoryLocations.id, locId), eq(inventoryLocations.organizationId, organizationId)))
        .limit(1);
      if (!loc) return { error: "Location not found." };
    }
  }

  const shapeError = validateMovementShape({
    type: input.type,
    quantity: input.quantity,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
  });
  if (shapeError) return { error: shapeError };

  const delta = deltasFor(input.type, input.quantity);

  // Pre-flight negative-stock check on the from-location.
  if (input.fromLocationId && delta.fromDelta < 0) {
    const [stock] = await db
      .select()
      .from(inventoryStockLevels)
      .where(
        and(
          eq(inventoryStockLevels.itemId, input.itemId),
          eq(inventoryStockLevels.locationId, input.fromLocationId),
        ),
      )
      .limit(1);
    const currentQty = asNumber(stock?.quantity);
    if (wouldGoNegative(currentQty, delta, input.allowNegative ?? false)) {
      return {
        error: `Insufficient stock at source (${currentQty} available, ${Math.abs(delta.fromDelta)} required).`,
      };
    }
  }

  // Mint a movement code.
  const counter = await nextMovementCounter();
  const movementCode = buildMovementCode(counter);

  const [movement] = await db
    .insert(inventoryMovements)
    .values({
      organizationId,
      movementCode,
      itemId: input.itemId,
      movementType: input.type,
      quantity: String(input.quantity),
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      reason: input.reason ?? null,
      taskId: input.taskId ?? null,
      checklistItemId: input.checklistItemId ?? null,
      damageReportId: input.damageReportId ?? null,
      purchaseOrderId: input.purchaseOrderId ?? null,
      unitCostMinor: input.unitCostMinor ?? null,
      currency: input.currency ?? null,
      createdBy: input.actorUserId ?? null,
    })
    .returning({ id: inventoryMovements.id });

  // Upsert stock levels for both legs (when applicable).
  await upsertStockLevel(db, input.itemId, input.fromLocationId ?? null, delta.fromDelta);
  await upsertStockLevel(db, input.itemId, input.toLocationId ?? null, delta.toDelta);

  return { movementId: movement.id };
}

async function upsertStockLevel(
  db: NonNullable<ReturnType<typeof getDb>>,
  itemId: string,
  locationId: string | null,
  delta: number,
) {
  if (!locationId || delta === 0) return;

  const [existing] = await db
    .select()
    .from(inventoryStockLevels)
    .where(
      and(
        eq(inventoryStockLevels.itemId, itemId),
        eq(inventoryStockLevels.locationId, locationId),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(inventoryStockLevels).values({
      itemId,
      locationId,
      quantity: String(delta),
    });
    return;
  }

  const newQty = asNumber(existing.quantity) + delta;
  await db
    .update(inventoryStockLevels)
    .set({ quantity: String(newQty), updatedAt: new Date() })
    .where(eq(inventoryStockLevels.id, existing.id));
}

// -----------------------------------------------------------------------------
// Public movement actions
// -----------------------------------------------------------------------------

export async function createInventoryMovementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const parsed = createMovementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const result = await applyMovement({
    itemId: d.itemId,
    type: d.movementType,
    quantity: d.quantity,
    fromLocationId: d.fromLocationId,
    toLocationId: d.toLocationId,
    reason: d.reason && d.reason !== "" ? d.reason : null,
    taskId: d.taskId,
    checklistItemId: d.checklistItemId,
    damageReportId: d.damageReportId,
    purchaseOrderId: d.purchaseOrderId,
    unitCostMinor: d.unitCostMinor ?? null,
    currency: d.currency && d.currency !== "" ? d.currency : null,
    allowNegative: d.allowNegative,
    actorUserId: me?.id ?? null,
  });
  if ("error" in result) return { ok: false, error: result.error };

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `inventory.movement.${d.movementType}`,
    entityType: "inventory_movement",
    entityId: result.movementId,
    after: {
      itemId: d.itemId,
      quantity: d.quantity,
      from: d.fromLocationId ?? null,
      to: d.toLocationId ?? null,
    },
  });

  revalidatePath("/dashboard/inventory/movements");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/stock");
  return { ok: true, redirectTo: "/dashboard/inventory/movements" };
}

// Convenience wrappers — same Zod schema, different defaults / permissions.
export const receiveInventoryAction = createInventoryMovementAction;
export const transferInventoryAction = createInventoryMovementAction;
export const writeOffInventoryAction = createInventoryMovementAction;

export async function adjustInventoryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.adjust");
  formData.set("movementType", "adjust");
  return createInventoryMovementAction(_prev, formData);
}

// -----------------------------------------------------------------------------
// Task material usage
// -----------------------------------------------------------------------------

export async function consumeInventoryForTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return createTaskMaterialUsageAction(_prev, formData);
}

export async function createTaskMaterialUsageAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.write");
  const parsed = taskMaterialUsageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const d = parsed.data;

  // Pull item (scoped to the caller's org) to capture unit cost / currency.
  // applyMovement re-validates org too — this also stops a cross-org cost read.
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, d.itemId), eq(inventoryItems.organizationId, organizationId)))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };

  const movement = await applyMovement({
    itemId: d.itemId,
    type: "consume",
    quantity: d.quantity,
    fromLocationId: d.locationId,
    taskId: d.taskId,
    reason: d.notes && d.notes !== "" ? d.notes : null,
    unitCostMinor: item.unitCostMinor ?? null,
    currency: item.currency ?? null,
    actorUserId: me?.id ?? null,
  });
  if ("error" in movement) return { ok: false, error: movement.error };

  const [usage] = await db
    .insert(taskMaterialUsage)
    .values({
      taskId: d.taskId,
      itemId: d.itemId,
      locationId: d.locationId,
      quantity: String(d.quantity),
      unitCostMinor: item.unitCostMinor ?? null,
      currency: item.currency ?? null,
      movementId: movement.movementId,
      notes: d.notes && d.notes !== "" ? d.notes : null,
      createdBy: me?.id ?? null,
    })
    .returning({ id: taskMaterialUsage.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.task_material_usage.create",
    entityType: "task_material_usage",
    entityId: usage.id,
    after: { taskId: d.taskId, itemId: d.itemId, quantity: d.quantity },
  });

  revalidatePath(`/dashboard/operations/tasks/${d.taskId}`);
  revalidatePath(`/field/tasks/${d.taskId}`);
  revalidatePath("/dashboard/inventory/movements");
  return { ok: true };
}
