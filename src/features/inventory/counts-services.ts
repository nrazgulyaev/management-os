import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  inventoryCountLines,
  inventoryCounts,
  inventoryItems,
  inventoryLocations,
  inventoryStockLevels,
} from "@/lib/db/schema/inventory";
import { appUsers } from "@/lib/db/schema/identity";
import type { WithSource } from "@/features/types";
import { asNumber } from "./stock";

export interface InventoryCountRow {
  id: string;
  countCode: string;
  status: string;
  locationId: string;
  locationName: string;
  countedByName: string | null;
  approvedByName: string | null;
  countedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  notes: string | null;
  lineCount: number;
  varianceAbs: number;
}

export interface InventoryCountLineRow {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string;
  expectedQuantity: number | null;
  countedQuantity: number;
  varianceQuantity: number | null;
  notes: string | null;
}

export async function listInventoryCounts(): Promise<WithSource<InventoryCountRow>[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      c: inventoryCounts,
      locationName: inventoryLocations.name,
      counterName: appUsers.fullName,
      lineCount: sql<number>`(SELECT count(*) FROM inventory_count_lines l WHERE l.count_id = ${inventoryCounts.id})`.as(
        "line_count",
      ),
      varianceAbs: sql<string>`(SELECT COALESCE(SUM(ABS(l.variance_quantity)), 0) FROM inventory_count_lines l WHERE l.count_id = ${inventoryCounts.id})`.as(
        "variance_abs",
      ),
    })
    .from(inventoryCounts)
    .innerJoin(inventoryLocations, eq(inventoryLocations.id, inventoryCounts.locationId))
    .leftJoin(appUsers, eq(appUsers.id, inventoryCounts.countedBy))
    .where(eq(inventoryCounts.organizationId, organizationId))
    .orderBy(desc(inventoryCounts.createdAt))
    .limit(200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.c.id,
    countCode: r.c.countCode,
    status: r.c.status,
    locationId: r.c.locationId,
    locationName: r.locationName,
    countedByName: r.counterName ?? null,
    approvedByName: null,
    countedAt: r.c.countedAt?.toISOString() ?? null,
    approvedAt: r.c.approvedAt?.toISOString() ?? null,
    createdAt: r.c.createdAt.toISOString(),
    notes: r.c.notes,
    lineCount: Number(r.lineCount ?? 0),
    varianceAbs: asNumber(r.varianceAbs),
  }));
}

export interface InventoryCountDetail {
  id: string;
  countCode: string;
  status: string;
  locationId: string;
  locationName: string;
  notes: string | null;
  countedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  lines: InventoryCountLineRow[];
}

export async function getInventoryCountById(
  id: string,
): Promise<InventoryCountDetail | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [c] = await db
    .select({
      c: inventoryCounts,
      locationName: inventoryLocations.name,
    })
    .from(inventoryCounts)
    .innerJoin(inventoryLocations, eq(inventoryLocations.id, inventoryCounts.locationId))
    .where(and(eq(inventoryCounts.id, id), eq(inventoryCounts.organizationId, organizationId)))
    .limit(1);
  if (!c) return null;

  const lines = await db
    .select({
      l: inventoryCountLines,
      item: inventoryItems,
    })
    .from(inventoryCountLines)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryCountLines.itemId))
    .where(eq(inventoryCountLines.countId, id))
    .orderBy(asc(inventoryItems.name));

  return {
    id: c.c.id,
    countCode: c.c.countCode,
    status: c.c.status,
    locationId: c.c.locationId,
    locationName: c.locationName,
    notes: c.c.notes,
    countedAt: c.c.countedAt?.toISOString() ?? null,
    approvedAt: c.c.approvedAt?.toISOString() ?? null,
    createdAt: c.c.createdAt.toISOString(),
    lines: lines.map((row) => ({
      id: row.l.id,
      itemId: row.l.itemId,
      itemName: row.item.name,
      itemSku: row.item.sku,
      itemUnit: row.item.unit,
      expectedQuantity: row.l.expectedQuantity === null ? null : asNumber(row.l.expectedQuantity),
      countedQuantity: asNumber(row.l.countedQuantity),
      varianceQuantity:
        row.l.varianceQuantity === null ? null : asNumber(row.l.varianceQuantity),
      notes: row.l.notes,
    })),
  };
}

/**
 * Pre-fill count lines from the current stock_levels at the location.
 */
export async function preloadCountLinesForLocation(
  countId: string,
  locationId: string,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const organizationId = await requireOrgId();
  const stocks = await db
    .select({
      itemId: inventoryStockLevels.itemId,
      quantity: inventoryStockLevels.quantity,
    })
    .from(inventoryStockLevels)
    .where(
      and(
        eq(inventoryStockLevels.organizationId, organizationId),
        eq(inventoryStockLevels.locationId, locationId),
      ),
    );
  if (stocks.length === 0) return 0;

  await db.insert(inventoryCountLines).values(
    stocks.map((s) => ({
      // TENANCY: stamp the caller's org so updateInventoryCountLineAction
      // (which filters eq(line.organizationId, org)) can find these lines.
      organizationId,
      countId,
      itemId: s.itemId,
      expectedQuantity: s.quantity,
      countedQuantity: s.quantity, // start at expected; counter overwrites in UI
      varianceQuantity: "0",
    })),
  );
  return stocks.length;
}

export async function nextCountCounter(): Promise<number> {
  const db = getDb();
  if (!db) return 1;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const pattern = `CNT-${today}-%`;
  const [r] = await db
    .select({ count: sql<number>`count(*)` })
    .from(inventoryCounts)
    .where(sql`${inventoryCounts.countCode} like ${pattern}`);
  return Number(r?.count ?? 0) + 1;
}
