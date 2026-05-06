import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { unitCostAllocations } from "@/lib/db/schema/profitability-cashflow";
import { villas } from "@/lib/db/schema/projects";
import { assetTypes } from "@/lib/db/schema/asset-types";

export async function getCurrentAllocationForAsset(assetId: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(unitCostAllocations)
    .where(
      and(
        eq(unitCostAllocations.assetId, assetId),
        eq(unitCostAllocations.isCurrent, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listAllocationsForAsset(assetId: string) {
  const db = requireDb();
  return db
    .select()
    .from(unitCostAllocations)
    .where(eq(unitCostAllocations.assetId, assetId))
    .orderBy(desc(unitCostAllocations.computedAt));
}

export async function listCurrentAllocations(limit = 100) {
  const db = requireDb();
  return db
    .select({
      id: unitCostAllocations.id,
      assetId: unitCostAllocations.assetId,
      projectId: unitCostAllocations.projectId,
      unitCode: villas.unitCode,
      assetTypeKey: assetTypes.typeKey,
      totalCostBasisMinor: unitCostAllocations.totalCostBasisMinor,
      expectedSalePriceMinor: unitCostAllocations.expectedSalePriceMinor,
      expectedMarginMinor: unitCostAllocations.expectedMarginMinor,
      marginPercentage: unitCostAllocations.marginPercentage,
      currency: unitCostAllocations.currency,
      computedAt: unitCostAllocations.computedAt,
    })
    .from(unitCostAllocations)
    .innerJoin(villas, eq(villas.id, unitCostAllocations.assetId))
    .innerJoin(assetTypes, eq(assetTypes.id, villas.assetTypeId))
    .where(eq(unitCostAllocations.isCurrent, true))
    .orderBy(desc(unitCostAllocations.computedAt))
    .limit(limit);
}

export async function listProjectAllocations(projectId: string) {
  const db = requireDb();
  return db
    .select({
      id: unitCostAllocations.id,
      assetId: unitCostAllocations.assetId,
      unitCode: villas.unitCode,
      assetTypeKey: assetTypes.typeKey,
      totalCostBasisMinor: unitCostAllocations.totalCostBasisMinor,
      expectedSalePriceMinor: unitCostAllocations.expectedSalePriceMinor,
      expectedMarginMinor: unitCostAllocations.expectedMarginMinor,
      marginPercentage: unitCostAllocations.marginPercentage,
      currency: unitCostAllocations.currency,
      computedAt: unitCostAllocations.computedAt,
    })
    .from(unitCostAllocations)
    .innerJoin(villas, eq(villas.id, unitCostAllocations.assetId))
    .innerJoin(assetTypes, eq(assetTypes.id, villas.assetTypeId))
    .where(
      and(
        eq(unitCostAllocations.projectId, projectId),
        eq(unitCostAllocations.isCurrent, true),
      ),
    )
    .orderBy(villas.unitCode);
}
