import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  devOsInventoryItems,
  devOsInventoryLocations,
  devOsInventoryStockBalances,
  devOsInventoryMovements,
} from "@/lib/db/schema/dev-os-inventory";

export async function listInventoryItems(filters?: {
  category?: string;
  activeOnly?: boolean;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.activeOnly !== false) {
    conditions.push(eq(devOsInventoryItems.isActive, true));
  }
  if (filters?.category) {
    conditions.push(eq(devOsInventoryItems.category, filters.category));
  }
  return db
    .select()
    .from(devOsInventoryItems)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(devOsInventoryItems.sku));
}

export async function getInventoryItemBySku(sku: string) {
  const db = requireDb();
  const [item] = await db
    .select()
    .from(devOsInventoryItems)
    .where(eq(devOsInventoryItems.sku, sku))
    .limit(1);
  if (!item) return null;
  const balances = await db
    .select({
      id: devOsInventoryStockBalances.id,
      locationId: devOsInventoryStockBalances.locationId,
      locationCode: devOsInventoryLocations.locationCode,
      locationName: devOsInventoryLocations.displayName,
      quantityOnHand: devOsInventoryStockBalances.quantityOnHand,
      quantityReserved: devOsInventoryStockBalances.quantityReserved,
      quantityAvailable: devOsInventoryStockBalances.quantityAvailable,
      lastMovementAt: devOsInventoryStockBalances.lastMovementAt,
    })
    .from(devOsInventoryStockBalances)
    .innerJoin(
      devOsInventoryLocations,
      eq(devOsInventoryLocations.id, devOsInventoryStockBalances.locationId),
    )
    .where(eq(devOsInventoryStockBalances.itemId, item.id));
  return { item, balances };
}

export async function listInventoryLocations() {
  const db = requireDb();
  return db
    .select()
    .from(devOsInventoryLocations)
    .where(eq(devOsInventoryLocations.isActive, true))
    .orderBy(asc(devOsInventoryLocations.locationCode));
}

export async function listInventoryMovements(filters?: {
  itemId?: string;
  locationId?: string;
  movementType?: string;
  projectId?: string;
  villaId?: string;
  limit?: number;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.itemId) {
    conditions.push(eq(devOsInventoryMovements.itemId, filters.itemId));
  }
  if (filters?.locationId) {
    conditions.push(
      sql`${devOsInventoryMovements.fromLocationId} = ${filters.locationId} OR ${devOsInventoryMovements.toLocationId} = ${filters.locationId}` as ReturnType<typeof eq>,
    );
  }
  if (filters?.movementType) {
    conditions.push(
      eq(devOsInventoryMovements.movementType, filters.movementType),
    );
  }
  if (filters?.projectId) {
    conditions.push(eq(devOsInventoryMovements.projectId, filters.projectId));
  }
  if (filters?.villaId) {
    conditions.push(eq(devOsInventoryMovements.villaId, filters.villaId));
  }
  return db
    .select()
    .from(devOsInventoryMovements)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(devOsInventoryMovements.movementDate))
    .limit(filters?.limit ?? 100);
}

/**
 * Items where any location's on_hand <= reorder_point.
 */
export async function listLowStockItems() {
  const db = requireDb();
  const result = await db.execute<{
    item_id: string;
    sku: string;
    display_name: string;
    location_id: string;
    location_code: string;
    quantity_on_hand: string;
    reorder_point: string;
  }>(sql`
    SELECT
      i.id::text AS item_id,
      i.sku,
      i.display_name,
      l.id::text AS location_id,
      l.location_code,
      b.quantity_on_hand::text,
      i.reorder_point::text
    FROM dev_os_inventory_items i
    JOIN dev_os_inventory_stock_balances b ON b.item_id = i.id
    JOIN dev_os_inventory_locations l ON l.id = b.location_id
    WHERE i.is_active = TRUE
      AND i.reorder_point IS NOT NULL
      AND b.quantity_on_hand <= i.reorder_point
    ORDER BY i.sku, l.location_code
  `);
  return (result as unknown as { rows: Array<Record<string, string>> }).rows ??
    [];
}
