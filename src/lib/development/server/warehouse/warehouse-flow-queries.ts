import "server-only";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireDb } from "@/lib/db/client";
import {
  devOsInventoryItems,
  devOsInventoryLocations,
  devOsInventoryMovements,
  devOsInventoryStockBalances,
} from "@/lib/db/schema/dev-os-inventory";
import { projects, villas } from "@/lib/db/schema/projects";
import { appUsers } from "@/lib/db/schema/identity";

/**
 * build-warehouse-flow — org-scoped read queries backing the warehouse
 * OUTBOUND/log sub-routes (/warehouse/picks · /warehouse/movements ·
 * /warehouse/bins). Reuses the existing dev_os_inventory_* tables; every
 * read is filtered by organization_id (operator-facing tenancy).
 *
 * Distinct from inventory-queries.ts (which are not org-scoped): these
 * are the tenant-safe variants used by the warehouse flow pages.
 */

export interface WarehouseMovementRow {
  id: string;
  movementCode: string;
  movementType: string;
  itemName: string | null;
  itemSku: string | null;
  quantity: string;
  unitOfMeasure: string | null;
  fromLocationCode: string | null;
  toLocationCode: string | null;
  projectName: string | null;
  villaName: string | null;
  responsibleUserName: string | null;
  movementDate: string;
}

export interface ListMovementsFilter {
  organizationId: string;
  movementType?: string;
  itemId?: string;
  /** Free-text search over item SKU / display name (case-insensitive). */
  q?: string;
  /** inclusive lower bound, YYYY-MM-DD */
  dateFrom?: string;
  /** inclusive upper bound, YYYY-MM-DD */
  dateTo?: string;
  limit?: number;
}

/**
 * Filterable movements LOG (receipt/issue/adjust/transfer) for the
 * org. Joins item + locations + project/villa + actor for a readable row.
 */
export async function listWarehouseMovements(
  filter: ListMovementsFilter,
): Promise<WarehouseMovementRow[]> {
  const db = requireDb();
  const fromLoc = devOsInventoryLocations;
  const toLoc = alias(devOsInventoryLocations, "to_loc");
  const conditions = [
    eq(devOsInventoryMovements.organizationId, filter.organizationId),
  ];
  if (filter.movementType) {
    conditions.push(
      eq(devOsInventoryMovements.movementType, filter.movementType),
    );
  }
  if (filter.itemId) {
    conditions.push(eq(devOsInventoryMovements.itemId, filter.itemId));
  }
  if (filter.q) {
    // Free-text SKU search (mock §05 movements spec). Matching on the
    // joined item turns the left join into an effective inner join for
    // search results — exactly the wanted semantics.
    const pattern = `%${filter.q}%`;
    conditions.push(
      sql`(${devOsInventoryItems.sku} ILIKE ${pattern} OR ${devOsInventoryItems.displayName} ILIKE ${pattern})`,
    );
  }
  if (filter.dateFrom) {
    conditions.push(gte(devOsInventoryMovements.movementDate, filter.dateFrom));
  }
  if (filter.dateTo) {
    conditions.push(lte(devOsInventoryMovements.movementDate, filter.dateTo));
  }

  const rows = await db
    .select({
      id: devOsInventoryMovements.id,
      movementCode: devOsInventoryMovements.movementCode,
      movementType: devOsInventoryMovements.movementType,
      quantity: devOsInventoryMovements.quantity,
      movementDate: devOsInventoryMovements.movementDate,
      createdAt: devOsInventoryMovements.createdAt,
      itemName: devOsInventoryItems.displayName,
      itemSku: devOsInventoryItems.sku,
      unitOfMeasure: devOsInventoryItems.unitOfMeasure,
      fromLocationCode: fromLoc.locationCode,
      toLocationCode: toLoc.locationCode,
      projectName: projects.name,
      villaName: villas.name,
      responsibleUserName: appUsers.fullName,
    })
    .from(devOsInventoryMovements)
    .leftJoin(
      devOsInventoryItems,
      eq(devOsInventoryItems.id, devOsInventoryMovements.itemId),
    )
    .leftJoin(
      fromLoc,
      eq(fromLoc.id, devOsInventoryMovements.fromLocationId),
    )
    .leftJoin(toLoc, eq(toLoc.id, devOsInventoryMovements.toLocationId))
    .leftJoin(projects, eq(projects.id, devOsInventoryMovements.projectId))
    .leftJoin(villas, eq(villas.id, devOsInventoryMovements.villaId))
    .leftJoin(
      appUsers,
      eq(appUsers.id, devOsInventoryMovements.responsibleUserId),
    )
    .where(and(...conditions))
    .orderBy(
      desc(devOsInventoryMovements.movementDate),
      desc(devOsInventoryMovements.createdAt),
    )
    .limit(filter.limit ?? 200);

  return rows.map((r) => ({
    id: r.id,
    movementCode: r.movementCode,
    movementType: r.movementType,
    itemName: r.itemName ?? null,
    itemSku: r.itemSku ?? null,
    quantity: r.quantity,
    unitOfMeasure: r.unitOfMeasure ?? null,
    fromLocationCode: r.fromLocationCode ?? null,
    toLocationCode: r.toLocationCode ?? null,
    projectName: r.projectName ?? null,
    villaName: r.villaName ?? null,
    responsibleUserName: r.responsibleUserName ?? null,
    movementDate: r.movementDate,
  }));
}

export interface MovementTypeCount {
  movementType: string;
  count: number;
}

/** Per-type counts for the org (drives the filter facet + KPIs). */
export async function countWarehouseMovementsByType(
  organizationId: string,
): Promise<MovementTypeCount[]> {
  const db = requireDb();
  const rows = await db
    .select({
      movementType: devOsInventoryMovements.movementType,
      count: sql<string>`COUNT(*)::text`,
    })
    .from(devOsInventoryMovements)
    .where(eq(devOsInventoryMovements.organizationId, organizationId))
    .groupBy(devOsInventoryMovements.movementType)
    .orderBy(asc(devOsInventoryMovements.movementType));
  return rows.map((r) => ({
    movementType: r.movementType,
    count: Number(r.count ?? "0"),
  }));
}

export interface WarehouseItemOption {
  id: string;
  sku: string;
  displayName: string;
  unitOfMeasure: string;
}

/** Active SKUs for the org (item filter + pick line picker). */
export async function listWarehouseItems(
  organizationId: string,
): Promise<WarehouseItemOption[]> {
  const db = requireDb();
  const rows = await db
    .select({
      id: devOsInventoryItems.id,
      sku: devOsInventoryItems.sku,
      displayName: devOsInventoryItems.displayName,
      unitOfMeasure: devOsInventoryItems.unitOfMeasure,
    })
    .from(devOsInventoryItems)
    .where(
      and(
        eq(devOsInventoryItems.organizationId, organizationId),
        eq(devOsInventoryItems.isActive, true),
      ),
    )
    .orderBy(asc(devOsInventoryItems.sku));
  return rows;
}

export interface WarehouseLocationRow {
  id: string;
  locationCode: string;
  displayName: string;
  locationType: string;
  projectName: string | null;
}

/** Active locations for the org (bins view + dispatch source picker). */
export async function listWarehouseLocations(
  organizationId: string,
): Promise<WarehouseLocationRow[]> {
  const db = requireDb();
  const rows = await db
    .select({
      id: devOsInventoryLocations.id,
      locationCode: devOsInventoryLocations.locationCode,
      displayName: devOsInventoryLocations.displayName,
      locationType: devOsInventoryLocations.locationType,
      projectName: projects.name,
    })
    .from(devOsInventoryLocations)
    .leftJoin(projects, eq(projects.id, devOsInventoryLocations.projectId))
    .where(
      and(
        eq(devOsInventoryLocations.organizationId, organizationId),
        eq(devOsInventoryLocations.isActive, true),
      ),
    )
    .orderBy(asc(devOsInventoryLocations.locationCode));
  return rows;
}

export interface WarehouseLocationOccupancy {
  locationId: string;
  /** Distinct SKUs with on-hand > 0 at this location. */
  stockedItemCount: number;
  /** Σ quantity_on_hand across all SKUs at this location. */
  totalOnHand: number;
}

/**
 * Per-location occupancy for the bin map (mock §02 variant C). Aggregates
 * the real `dev_os_inventory_stock_balances` rows — distinct stocked SKUs
 * + total units on hand per location. Capacity (capacity_units) does not
 * exist in the schema, so utilisation % stays honestly absent.
 */
export async function listWarehouseLocationOccupancy(
  organizationId: string,
): Promise<WarehouseLocationOccupancy[]> {
  const db = requireDb();
  const rows = await db
    .select({
      locationId: devOsInventoryStockBalances.locationId,
      stockedItemCount: sql<string>`COUNT(*) FILTER (WHERE ${devOsInventoryStockBalances.quantityOnHand} > 0)::text`,
      totalOnHand: sql<string>`COALESCE(SUM(${devOsInventoryStockBalances.quantityOnHand}), 0)::text`,
    })
    .from(devOsInventoryStockBalances)
    .where(eq(devOsInventoryStockBalances.organizationId, organizationId))
    .groupBy(devOsInventoryStockBalances.locationId);
  return rows.map((r) => ({
    locationId: r.locationId,
    stockedItemCount: Number(r.stockedItemCount ?? "0"),
    totalOnHand: Number(r.totalOnHand ?? "0"),
  }));
}

export interface PickDestinationGroup {
  /** Stable group key: project id, villa id, or location id. */
  key: string;
  kind: "project" | "villa" | "location";
  label: string;
  /** Today's issue-style movements already dispatched to this destination. */
  dispatchedToday: number;
  /** Distinct SKUs dispatched to this destination today. */
  distinctSkus: number;
}

/**
 * Today's picks grouped by destination (project / villa / site location).
 * A "pick" here = an outbound issue movement dispatched to a site
 * destination today; we group them so the operator sees, per villa /
 * project, what has already left the warehouse today.
 *
 * The dispatch ACTION (warehouse-flow-actions.dispatchPick) appends a
 * new issued_to_site movement; this read is what the page re-renders.
 */
export async function listTodayPicksByDestination(
  organizationId: string,
): Promise<PickDestinationGroup[]> {
  const db = requireDb();
  const ISSUE_TYPES = ["issued_to_site", "used", "transferred"];

  const rows = await db
    .select({
      projectId: devOsInventoryMovements.projectId,
      villaId: devOsInventoryMovements.villaId,
      toLocationId: devOsInventoryMovements.toLocationId,
      projectName: projects.name,
      villaName: villas.name,
      toLocationName: devOsInventoryLocations.displayName,
      itemId: devOsInventoryMovements.itemId,
    })
    .from(devOsInventoryMovements)
    .leftJoin(projects, eq(projects.id, devOsInventoryMovements.projectId))
    .leftJoin(villas, eq(villas.id, devOsInventoryMovements.villaId))
    .leftJoin(
      devOsInventoryLocations,
      eq(
        devOsInventoryLocations.id,
        devOsInventoryMovements.toLocationId,
      ),
    )
    .where(
      and(
        eq(devOsInventoryMovements.organizationId, organizationId),
        sql`${devOsInventoryMovements.movementDate} = CURRENT_DATE`,
        sql`${devOsInventoryMovements.movementType} = ANY(${ISSUE_TYPES})`,
      ),
    );

  const groups = new Map<
    string,
    {
      kind: "project" | "villa" | "location";
      label: string;
      count: number;
      skus: Set<string>;
    }
  >();

  for (const r of rows) {
    let key: string;
    let kind: "project" | "villa" | "location";
    let label: string;
    if (r.projectId) {
      key = `project:${r.projectId}`;
      kind = "project";
      label = r.projectName ?? "Unnamed project";
    } else if (r.villaId) {
      key = `villa:${r.villaId}`;
      kind = "villa";
      label = r.villaName ?? "Unnamed villa";
    } else if (r.toLocationId) {
      key = `location:${r.toLocationId}`;
      kind = "location";
      label = r.toLocationName ?? "Site location";
    } else {
      key = "unassigned";
      kind = "location";
      label = "Unassigned / ops";
    }
    const g = groups.get(key) ?? {
      kind,
      label,
      count: 0,
      skus: new Set<string>(),
    };
    g.count += 1;
    g.skus.add(r.itemId);
    groups.set(key, g);
  }

  return Array.from(groups.entries())
    .map(([key, g]) => ({
      key,
      kind: g.kind,
      label: g.label,
      dispatchedToday: g.count,
      distinctSkus: g.skus.size,
    }))
    .sort((a, b) => b.dispatchedToday - a.dispatchedToday);
}

export interface SiteDestinationOption {
  /** project | villa | location id, prefixed by kind. */
  value: string;
  label: string;
  kind: "project" | "villa" | "location";
}

/**
 * Candidate site destinations for a new pick/dispatch — the org's
 * projects, villas, and site/in_transit locations.
 */
export async function listPickDestinations(
  organizationId: string,
): Promise<SiteDestinationOption[]> {
  const db = requireDb();
  const [projectRows, villaRows, locationRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.organizationId, organizationId))
      .orderBy(asc(projects.name)),
    db
      .select({ id: villas.id, name: villas.name, projectId: villas.projectId })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(projects.organizationId, organizationId))
      .orderBy(asc(villas.name)),
    db
      .select({
        id: devOsInventoryLocations.id,
        name: devOsInventoryLocations.displayName,
        locationType: devOsInventoryLocations.locationType,
      })
      .from(devOsInventoryLocations)
      .where(
        and(
          eq(devOsInventoryLocations.organizationId, organizationId),
          eq(devOsInventoryLocations.isActive, true),
        ),
      )
      .orderBy(asc(devOsInventoryLocations.locationCode)),
  ]);

  const out: SiteDestinationOption[] = [];
  for (const p of projectRows) {
    out.push({ value: `project:${p.id}`, label: `Project · ${p.name}`, kind: "project" });
  }
  for (const v of villaRows) {
    out.push({
      value: `villa:${v.id}`,
      label: `Villa · ${v.name ?? "Unnamed"}`,
      kind: "villa",
    });
  }
  for (const l of locationRows) {
    if (l.locationType === "site" || l.locationType === "in_transit") {
      out.push({
        value: `location:${l.id}`,
        label: `Location · ${l.name}`,
        kind: "location",
      });
    }
  }
  return out;
}

/** Warehouse-type source locations to debit a pick from. */
export async function listSourceWarehouseLocations(
  organizationId: string,
): Promise<WarehouseLocationRow[]> {
  const all = await listWarehouseLocations(organizationId);
  return all.filter((l) => l.locationType === "warehouse");
}
