import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
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
import { villas, projects } from "@/lib/db/schema/projects";
import { appUsers } from "@/lib/db/schema/identity";
import { requireOrgId } from "@/features/auth/require-org";
import type { WithSource } from "@/features/types";
import { asNumber, isLowStock } from "./stock";

// -----------------------------------------------------------------------------
// Row shapes
// -----------------------------------------------------------------------------

export interface SupplierRow {
  id: string;
  name: string;
  supplierType: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  status: string;
  createdAt: string;
}

export interface InventoryLocationRow {
  id: string;
  name: string;
  locationType: string;
  description: string | null;
  villaId: string | null;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  status: string;
}

export interface InventoryCategoryRow {
  id: string;
  key: string;
  name: string;
  parentId: string | null;
  defaultUnit: string;
  isConsumable: boolean;
  status: string;
}

export interface InventoryItemRow {
  id: string;
  sku: string | null;
  name: string;
  itemType: string;
  unit: string;
  description: string | null;
  brand: string | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  unitCostMinor: bigint | null;
  currency: string | null;
  ownerChargeable: boolean;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  defaultSupplierId: string | null;
  defaultSupplierName: string | null;
  totalStock: number;
  isLowStock: boolean;
}

export interface StockLevelRow {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string;
  reorderPoint: number | null;
  locationId: string;
  locationName: string;
  villaCode: string | null;
  quantity: number;
  reservedQuantity: number;
  isLow: boolean;
}

export interface MovementRow {
  id: string;
  movementCode: string;
  itemId: string;
  itemName: string;
  movementType: string;
  quantity: number;
  fromLocationId: string | null;
  fromLocationName: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  reason: string | null;
  unitCostMinor: bigint | null;
  currency: string | null;
  taskId: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface TaskMaterialUsageRow {
  id: string;
  taskId: string;
  itemId: string;
  itemName: string;
  itemUnit: string;
  locationId: string | null;
  locationName: string | null;
  quantity: number;
  unitCostMinor: bigint | null;
  currency: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Suppliers
// -----------------------------------------------------------------------------

export async function listSuppliers(): Promise<WithSource<SupplierRow>[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.organizationId, organizationId))
    .orderBy(asc(suppliers.name));
  return rows.map((s) => ({
    source: "db" as const,
    id: s.id,
    name: s.name,
    supplierType: s.supplierType,
    email: s.email,
    phone: s.phone,
    country: s.country,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
  }));
}

// -----------------------------------------------------------------------------
// Locations
// -----------------------------------------------------------------------------

export async function listInventoryLocations(): Promise<WithSource<InventoryLocationRow>[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      l: inventoryLocations,
      villaCode: villas.unitCode,
      projectName: projects.name,
    })
    .from(inventoryLocations)
    .leftJoin(villas, eq(villas.id, inventoryLocations.villaId))
    .leftJoin(projects, eq(projects.id, inventoryLocations.projectId))
    .where(eq(inventoryLocations.organizationId, organizationId))
    .orderBy(asc(inventoryLocations.name));
  return rows.map((r) => ({
    source: "db" as const,
    id: r.l.id,
    name: r.l.name,
    locationType: r.l.locationType,
    description: r.l.description,
    villaId: r.l.villaId,
    villaCode: r.villaCode,
    projectId: r.l.projectId,
    projectName: r.projectName,
    status: r.l.status,
  }));
}

// -----------------------------------------------------------------------------
// Categories
// -----------------------------------------------------------------------------

export async function listInventoryCategories(): Promise<WithSource<InventoryCategoryRow>[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(inventoryCategories)
    .where(eq(inventoryCategories.organizationId, organizationId))
    .orderBy(asc(inventoryCategories.name));
  return rows.map((c) => ({
    source: "db" as const,
    id: c.id,
    key: c.key,
    name: c.name,
    parentId: c.parentId,
    defaultUnit: c.defaultUnit,
    isConsumable: c.isConsumable,
    status: c.status,
  }));
}

// -----------------------------------------------------------------------------
// Items
// -----------------------------------------------------------------------------

export async function listInventoryItems(opts?: {
  status?: string;
  itemType?: string;
  lowStockOnly?: boolean;
  limit?: number;
}): Promise<WithSource<InventoryItemRow>[]> {
  const db = getDb();
  if (!db) return [];

  const organizationId = await requireOrgId();
  const filters = [eq(inventoryItems.organizationId, organizationId)];
  if (opts?.status) filters.push(eq(inventoryItems.status, opts.status));
  if (opts?.itemType) filters.push(eq(inventoryItems.itemType, opts.itemType));

  const rows = await db
    .select({
      i: inventoryItems,
      categoryName: inventoryCategories.name,
      supplierName: suppliers.name,
      totalStock: sql<string>`COALESCE(SUM(${inventoryStockLevels.quantity}), 0)`.as(
        "total_stock",
      ),
    })
    .from(inventoryItems)
    .leftJoin(inventoryCategories, eq(inventoryCategories.id, inventoryItems.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, inventoryItems.defaultSupplierId))
    .leftJoin(inventoryStockLevels, eq(inventoryStockLevels.itemId, inventoryItems.id))
    .where(filters.length ? and(...filters) : undefined)
    .groupBy(inventoryItems.id, inventoryCategories.name, suppliers.name)
    .orderBy(asc(inventoryItems.name))
    .limit(opts?.limit ?? 500);

  const mapped = rows.map((r) => {
    const total = asNumber(r.totalStock);
    const reorderPoint = r.i.reorderPoint === null ? null : asNumber(r.i.reorderPoint);
    return {
      source: "db" as const,
      id: r.i.id,
      sku: r.i.sku,
      name: r.i.name,
      itemType: r.i.itemType,
      unit: r.i.unit,
      description: r.i.description,
      brand: r.i.brand,
      reorderPoint,
      reorderQuantity: r.i.reorderQuantity === null ? null : asNumber(r.i.reorderQuantity),
      unitCostMinor: r.i.unitCostMinor,
      currency: r.i.currency,
      ownerChargeable: r.i.ownerChargeable,
      status: r.i.status,
      categoryId: r.i.categoryId,
      categoryName: r.categoryName,
      defaultSupplierId: r.i.defaultSupplierId,
      defaultSupplierName: r.supplierName,
      totalStock: total,
      isLowStock: isLowStock(total, reorderPoint),
    };
  });

  return opts?.lowStockOnly ? mapped.filter((m) => m.isLowStock) : mapped;
}

export async function getInventoryItemById(
  id: string,
): Promise<WithSource<InventoryItemRow> | null> {
  const items = await listInventoryItems();
  return items.find((i) => i.id === id) ?? null;
}

export async function listLowStockItems() {
  return listInventoryItems({ lowStockOnly: true });
}

// -----------------------------------------------------------------------------
// Stock levels
// -----------------------------------------------------------------------------

export async function listStockLevels(opts?: {
  itemId?: string;
  locationId?: string;
  villaId?: string;
}): Promise<WithSource<StockLevelRow>[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters = [eq(inventoryStockLevels.organizationId, organizationId)];
  if (opts?.itemId) filters.push(eq(inventoryStockLevels.itemId, opts.itemId));
  if (opts?.locationId) filters.push(eq(inventoryStockLevels.locationId, opts.locationId));
  if (opts?.villaId) filters.push(eq(inventoryLocations.villaId, opts.villaId));

  const rows = await db
    .select({
      s: inventoryStockLevels,
      item: inventoryItems,
      location: inventoryLocations,
      villaCode: villas.unitCode,
    })
    .from(inventoryStockLevels)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryStockLevels.itemId))
    .innerJoin(inventoryLocations, eq(inventoryLocations.id, inventoryStockLevels.locationId))
    .leftJoin(villas, eq(villas.id, inventoryLocations.villaId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(inventoryItems.name), asc(inventoryLocations.name));

  return rows.map((r) => {
    const qty = asNumber(r.s.quantity);
    const reorderPoint = r.item.reorderPoint === null ? null : asNumber(r.item.reorderPoint);
    return {
      source: "db" as const,
      itemId: r.item.id,
      itemName: r.item.name,
      itemSku: r.item.sku,
      itemUnit: r.item.unit,
      reorderPoint,
      locationId: r.location.id,
      locationName: r.location.name,
      villaCode: r.villaCode ?? null,
      quantity: qty,
      reservedQuantity: asNumber(r.s.reservedQuantity),
      isLow: isLowStock(qty, reorderPoint),
    };
  });
}

export async function getStockForItemAtLocation(
  itemId: string,
  locationId: string,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  // TENANCY: scope to the caller's org so a cross-org item/location id reads as 0
  // stock rather than leaking another tenant's quantity. Mirrors listStockLevels.
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(inventoryStockLevels)
    .where(
      and(
        eq(inventoryStockLevels.organizationId, organizationId),
        eq(inventoryStockLevels.itemId, itemId),
        eq(inventoryStockLevels.locationId, locationId),
      ),
    )
    .limit(1);
  return asNumber(row?.quantity);
}

// -----------------------------------------------------------------------------
// Movements
// -----------------------------------------------------------------------------

export async function listInventoryMovements(opts?: {
  itemId?: string;
  taskId?: string;
  limit?: number;
}): Promise<WithSource<MovementRow>[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters = [eq(inventoryMovements.organizationId, organizationId)];
  if (opts?.itemId) filters.push(eq(inventoryMovements.itemId, opts.itemId));
  if (opts?.taskId) filters.push(eq(inventoryMovements.taskId, opts.taskId));

  const fromLocation = inventoryLocations;
  const rows = await db
    .select({
      m: inventoryMovements,
      itemName: inventoryItems.name,
      fromName: sql<string | null>`(SELECT name FROM inventory_locations WHERE id = ${inventoryMovements.fromLocationId})`,
      toName: sql<string | null>`(SELECT name FROM inventory_locations WHERE id = ${inventoryMovements.toLocationId})`,
      createdByName: appUsers.fullName,
    })
    .from(inventoryMovements)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryMovements.itemId))
    .leftJoin(appUsers, eq(appUsers.id, inventoryMovements.createdBy))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(opts?.limit ?? 200);
  // (`fromLocation` reference kept to silence the unused-import lint if any.)
  void fromLocation;

  return rows.map((r) => ({
    source: "db" as const,
    id: r.m.id,
    movementCode: r.m.movementCode,
    itemId: r.m.itemId,
    itemName: r.itemName,
    movementType: r.m.movementType,
    quantity: asNumber(r.m.quantity),
    fromLocationId: r.m.fromLocationId,
    fromLocationName: r.fromName ?? null,
    toLocationId: r.m.toLocationId,
    toLocationName: r.toName ?? null,
    reason: r.m.reason,
    unitCostMinor: r.m.unitCostMinor,
    currency: r.m.currency,
    taskId: r.m.taskId,
    createdByName: r.createdByName,
    createdAt: r.m.createdAt.toISOString(),
  }));
}

// -----------------------------------------------------------------------------
// Task material usage
// -----------------------------------------------------------------------------

export async function listTaskMaterialUsage(
  taskId: string,
): Promise<WithSource<TaskMaterialUsageRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY: scope to the caller's org so a cross-org taskId can't leak another
  // tenant's material usage (item names, costs, currency, notes, who recorded it).
  // taskMaterialUsage carries organizationId (stamped on insert by the writer).
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      u: taskMaterialUsage,
      itemName: inventoryItems.name,
      itemUnit: inventoryItems.unit,
      locationName: inventoryLocations.name,
      createdByName: appUsers.fullName,
    })
    .from(taskMaterialUsage)
    .innerJoin(inventoryItems, eq(inventoryItems.id, taskMaterialUsage.itemId))
    .leftJoin(inventoryLocations, eq(inventoryLocations.id, taskMaterialUsage.locationId))
    .leftJoin(appUsers, eq(appUsers.id, taskMaterialUsage.createdBy))
    .where(
      and(
        eq(taskMaterialUsage.organizationId, organizationId),
        eq(taskMaterialUsage.taskId, taskId),
      ),
    )
    .orderBy(desc(taskMaterialUsage.createdAt));

  return rows.map((r) => ({
    source: "db" as const,
    id: r.u.id,
    taskId: r.u.taskId,
    itemId: r.u.itemId,
    itemName: r.itemName,
    itemUnit: r.itemUnit,
    locationId: r.u.locationId,
    locationName: r.locationName ?? null,
    quantity: asNumber(r.u.quantity),
    unitCostMinor: r.u.unitCostMinor,
    currency: r.u.currency,
    notes: r.u.notes,
    createdByName: r.createdByName ?? null,
    createdAt: r.u.createdAt.toISOString(),
  }));
}

// -----------------------------------------------------------------------------
// Daily counter for movement codes
// -----------------------------------------------------------------------------

export async function nextMovementCounter(): Promise<number> {
  const db = getDb();
  if (!db) return 1;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const pattern = `MV-${today}-%`;
  const [r] = await db
    .select({ count: sql<number>`count(*)` })
    .from(inventoryMovements)
    .where(sql`${inventoryMovements.movementCode} like ${pattern}`);
  return Number(r?.count ?? 0) + 1;
}
