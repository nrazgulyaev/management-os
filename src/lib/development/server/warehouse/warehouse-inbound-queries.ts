import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  materialPurchaseOrders,
  materialPoLines,
  vendors,
} from "@/lib/db/schema/site-operations";
import { projects } from "@/lib/db/schema/projects";
import {
  devOsInventoryItems,
  devOsInventoryLocations,
  devOsInventoryStockBalances,
} from "@/lib/db/schema/dev-os-inventory";
import type { MaterialPoStatus } from "@/lib/development/constants/material-constants";

/**
 * Warehouse INBOUND read-side (dev-warehouse mock §03 + §01 stock).
 *
 * Reuses the live Dev OS inventory schema (`dev_os_inventory_*`) and the
 * procurement PO chain (`material_purchase_orders` + `material_po_lines`)
 * — the same tables the warehouse cabinet landing already reads. Every
 * read is org-scoped via `requireOrgId()` (defence in depth on top of the
 * single-tenant legacy data). No money writes happen here; receipt + count
 * mutations live in the action layer.
 */

export interface WarehouseReceiveLine {
  id: string;
  lineNumber: number;
  materialName: string;
  materialCategory: string | null;
  unitOfMeasure: string;
  quantityOrdered: number;
  quantityDelivered: number;
  /** ordered − delivered (clamped at 0). */
  outstanding: number;
  /** Matched Dev OS inventory item (by SKU == material_name), if any. */
  matchedItemId: string | null;
  matchedSku: string | null;
}

export interface WarehouseLocationOption {
  id: string;
  locationCode: string;
  displayName: string;
}

export interface WarehouseReceiveDetail {
  poId: string;
  poCode: string;
  status: MaterialPoStatus;
  vendorLegalName: string;
  vendorCode: string;
  projectName: string | null;
  orderDate: string;
  expectedDeliveryDate: string | null;
  receivedAt: string | null;
  totalAmountUsdMinor: bigint | null;
  totalAmountCurrency: string;
  notes: string | null;
  lines: WarehouseReceiveLine[];
  /** Σ outstanding across all lines. */
  outstandingQty: number;
  /** Warehouse-type locations the receipt can land in. */
  warehouseLocations: WarehouseLocationOption[];
}

/**
 * Load one PO for the receiving drill-in. Matches each PO line to a Dev OS
 * inventory item by SKU (case-insensitive on material_name) so the receipt
 * action can write a `received` movement against real stock when a match
 * exists. Returns null when the PO is missing or belongs to another org.
 */
export async function getWarehouseReceiveDetail(
  idOrCode: string,
): Promise<WarehouseReceiveDetail | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();

  const [po] = await db
    .select({
      id: materialPurchaseOrders.id,
      poCode: materialPurchaseOrders.poCode,
      status: materialPurchaseOrders.status,
      orderDate: materialPurchaseOrders.orderDate,
      expectedDeliveryDate: materialPurchaseOrders.expectedDeliveryDate,
      receivedAt: materialPurchaseOrders.receivedAt,
      totalAmountUsdMinor: materialPurchaseOrders.totalAmountUsdMinor,
      totalAmountCurrency: materialPurchaseOrders.totalAmountCurrency,
      notes: materialPurchaseOrders.notes,
      vendorLegalName: vendors.legalName,
      vendorCode: vendors.vendorCode,
      projectName: projects.name,
    })
    .from(materialPurchaseOrders)
    .innerJoin(vendors, eq(vendors.id, materialPurchaseOrders.vendorId))
    .leftJoin(projects, eq(projects.id, materialPurchaseOrders.projectId))
    .where(
      and(
        sql`(${materialPurchaseOrders.id}::text = ${idOrCode} OR ${materialPurchaseOrders.poCode} = ${idOrCode})`,
        eq(materialPurchaseOrders.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!po) return null;

  const lineRows = await db
    .select({
      id: materialPoLines.id,
      lineNumber: materialPoLines.lineNumber,
      materialName: materialPoLines.materialName,
      materialCategory: materialPoLines.materialCategory,
      unitOfMeasure: materialPoLines.unitOfMeasure,
      quantityOrdered: materialPoLines.quantityOrdered,
      quantityDelivered: materialPoLines.quantityDelivered,
      matchedItemId: devOsInventoryItems.id,
      matchedSku: devOsInventoryItems.sku,
    })
    .from(materialPoLines)
    .leftJoin(
      devOsInventoryItems,
      and(
        eq(devOsInventoryItems.organizationId, organizationId),
        sql`lower(${devOsInventoryItems.sku}) = lower(${materialPoLines.materialName})`,
      ),
    )
    .where(
      and(
        eq(materialPoLines.poId, po.id),
        eq(materialPoLines.organizationId, organizationId),
      ),
    )
    .orderBy(asc(materialPoLines.lineNumber));

  const lines: WarehouseReceiveLine[] = lineRows.map((l) => {
    const ordered = Number(l.quantityOrdered);
    const delivered = Number(l.quantityDelivered);
    return {
      id: l.id,
      lineNumber: l.lineNumber,
      materialName: l.materialName,
      materialCategory: l.materialCategory ?? null,
      unitOfMeasure: l.unitOfMeasure,
      quantityOrdered: ordered,
      quantityDelivered: delivered,
      outstanding: Math.max(0, ordered - delivered),
      matchedItemId: l.matchedItemId ?? null,
      matchedSku: l.matchedSku ?? null,
    };
  });

  const warehouseLocations = await db
    .select({
      id: devOsInventoryLocations.id,
      locationCode: devOsInventoryLocations.locationCode,
      displayName: devOsInventoryLocations.displayName,
    })
    .from(devOsInventoryLocations)
    .where(
      and(
        eq(devOsInventoryLocations.organizationId, organizationId),
        eq(devOsInventoryLocations.isActive, true),
        eq(devOsInventoryLocations.locationType, "warehouse"),
      ),
    )
    .orderBy(asc(devOsInventoryLocations.locationCode));

  return {
    poId: po.id,
    poCode: po.poCode,
    status: po.status as MaterialPoStatus,
    vendorLegalName: po.vendorLegalName,
    vendorCode: po.vendorCode,
    projectName: po.projectName ?? null,
    orderDate: String(po.orderDate),
    expectedDeliveryDate: po.expectedDeliveryDate
      ? String(po.expectedDeliveryDate)
      : null,
    receivedAt: po.receivedAt ? new Date(po.receivedAt).toISOString() : null,
    totalAmountUsdMinor: po.totalAmountUsdMinor ?? null,
    totalAmountCurrency: po.totalAmountCurrency,
    notes: po.notes ?? null,
    lines,
    outstandingQty: lines.reduce((sum, l) => sum + l.outstanding, 0),
    warehouseLocations: warehouseLocations.map((w) => ({
      id: w.id,
      locationCode: w.locationCode,
      displayName: w.displayName,
    })),
  };
}

export interface WarehouseStockRow {
  itemId: string;
  sku: string;
  displayName: string;
  category: string;
  unitOfMeasure: string;
  /** Σ on-hand across all locations for this item. */
  onHand: number;
  /** Σ reserved across all locations. */
  reserved: number;
  /** Σ available = on-hand − reserved. */
  available: number;
  reorderPoint: number | null;
  /** "ok" | "warn" (at/under reorder) | "danger" (zero). */
  health: "ok" | "warn" | "danger";
}

export interface WarehouseStockList {
  rows: WarehouseStockRow[];
  totalSkuCount: number;
  lowStockCount: number;
  zeroStockCount: number;
  /** Default warehouse location for the count action, if any. */
  defaultLocation: WarehouseLocationOption | null;
}

/**
 * Full SKU stock list for the warehouse `/stock` view. Aggregates the
 * per-(item × location) balances into one row per SKU, classifies health
 * against the reorder point, and surfaces the default warehouse location
 * so the cycle-count action has a target.
 */
export async function getWarehouseStockList(): Promise<WarehouseStockList> {
  const db = getDb();
  if (!db) {
    return {
      rows: [],
      totalSkuCount: 0,
      lowStockCount: 0,
      zeroStockCount: 0,
      defaultLocation: null,
    };
  }
  const organizationId = await requireOrgId();

  const itemRows = await db
    .select({
      itemId: devOsInventoryItems.id,
      sku: devOsInventoryItems.sku,
      displayName: devOsInventoryItems.displayName,
      category: devOsInventoryItems.category,
      unitOfMeasure: devOsInventoryItems.unitOfMeasure,
      reorderPoint: devOsInventoryItems.reorderPoint,
      onHand: sql<string>`COALESCE(SUM(${devOsInventoryStockBalances.quantityOnHand}), 0)::text`,
      reserved: sql<string>`COALESCE(SUM(${devOsInventoryStockBalances.quantityReserved}), 0)::text`,
    })
    .from(devOsInventoryItems)
    .leftJoin(
      devOsInventoryStockBalances,
      eq(devOsInventoryStockBalances.itemId, devOsInventoryItems.id),
    )
    .where(
      and(
        eq(devOsInventoryItems.organizationId, organizationId),
        eq(devOsInventoryItems.isActive, true),
      ),
    )
    .groupBy(
      devOsInventoryItems.id,
      devOsInventoryItems.sku,
      devOsInventoryItems.displayName,
      devOsInventoryItems.category,
      devOsInventoryItems.unitOfMeasure,
      devOsInventoryItems.reorderPoint,
    )
    .orderBy(asc(devOsInventoryItems.sku));

  let lowStockCount = 0;
  let zeroStockCount = 0;
  const rows: WarehouseStockRow[] = itemRows.map((r) => {
    const onHand = Number(r.onHand);
    const reserved = Number(r.reserved);
    const reorderPoint = r.reorderPoint != null ? Number(r.reorderPoint) : null;
    let health: WarehouseStockRow["health"] = "ok";
    if (onHand <= 0) {
      health = "danger";
      zeroStockCount += 1;
    } else if (reorderPoint != null && onHand <= reorderPoint) {
      health = "warn";
      lowStockCount += 1;
    }
    return {
      itemId: r.itemId,
      sku: r.sku,
      displayName: r.displayName,
      category: r.category,
      unitOfMeasure: r.unitOfMeasure,
      onHand,
      reserved,
      available: onHand - reserved,
      reorderPoint,
      health,
    };
  });

  const [defaultLocation] = await db
    .select({
      id: devOsInventoryLocations.id,
      locationCode: devOsInventoryLocations.locationCode,
      displayName: devOsInventoryLocations.displayName,
    })
    .from(devOsInventoryLocations)
    .where(
      and(
        eq(devOsInventoryLocations.organizationId, organizationId),
        eq(devOsInventoryLocations.isActive, true),
        eq(devOsInventoryLocations.locationType, "warehouse"),
      ),
    )
    .orderBy(asc(devOsInventoryLocations.locationCode))
    .limit(1);

  return {
    rows,
    totalSkuCount: rows.length,
    lowStockCount,
    zeroStockCount,
    defaultLocation: defaultLocation
      ? {
          id: defaultLocation.id,
          locationCode: defaultLocation.locationCode,
          displayName: defaultLocation.displayName,
        }
      : null,
  };
}
