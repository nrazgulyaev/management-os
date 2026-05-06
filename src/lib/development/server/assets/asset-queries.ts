import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { villas } from "@/lib/db/schema/projects";
import { assetTypes } from "@/lib/db/schema/asset-types";

/**
 * List assets (the multi-asset table is named `villas` for FK
 * compatibility — see arch doc Stage 5.B.1).
 *
 * Filters by asset type key, asset category, project, etc.
 */
export async function listAssets(filters?: {
  projectId?: string;
  typeKey?: string;
  category?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(villas.projectId, filters.projectId));
  }
  if (filters?.typeKey) {
    conditions.push(eq(assetTypes.typeKey, filters.typeKey));
  }
  if (filters?.category) {
    conditions.push(eq(assetTypes.assetCategory, filters.category));
  }
  return db
    .select({
      id: villas.id,
      projectId: villas.projectId,
      slug: villas.slug,
      unitCode: villas.unitCode,
      name: villas.name,
      status: villas.status,
      assetTypeId: villas.assetTypeId,
      assetTypeKey: assetTypes.typeKey,
      assetTypeDisplayName: assetTypes.displayName,
      assetCategory: assetTypes.assetCategory,
      typeIsSaleable: assetTypes.isSaleable,
      typeIsRentable: assetTypes.isRentable,
      assetAttributes: villas.assetAttributes,
      createdAt: villas.createdAt,
    })
    .from(villas)
    .innerJoin(assetTypes, eq(assetTypes.id, villas.assetTypeId))
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(villas.unitCode));
}

export async function getAssetByCode(unitCode: string) {
  const db = requireDb();
  const [row] = await db
    .select({
      id: villas.id,
      projectId: villas.projectId,
      slug: villas.slug,
      unitCode: villas.unitCode,
      name: villas.name,
      status: villas.status,
      bedrooms: villas.bedrooms,
      bathrooms: villas.bathrooms,
      builtAreaSqm: villas.builtAreaSqm,
      landAreaSqm: villas.landAreaSqm,
      poolAreaSqm: villas.poolAreaSqm,
      viewType: villas.viewType,
      managementModel: villas.managementModel,
      currentNightlyRateUsd: villas.currentNightlyRateUsd,
      assetTypeId: villas.assetTypeId,
      assetTypeKey: assetTypes.typeKey,
      assetTypeDisplayName: assetTypes.displayName,
      assetCategory: assetTypes.assetCategory,
      typeIsSaleable: assetTypes.isSaleable,
      typeIsRentable: assetTypes.isRentable,
      assetAttributes: villas.assetAttributes,
      createdAt: villas.createdAt,
      updatedAt: villas.updatedAt,
    })
    .from(villas)
    .innerJoin(assetTypes, eq(assetTypes.id, villas.assetTypeId))
    .where(eq(villas.unitCode, unitCode))
    .limit(1);
  return row ?? null;
}

export async function listAssetTypes(filters?: { activeOnly?: boolean }) {
  const db = requireDb();
  if (filters?.activeOnly !== false) {
    return db
      .select()
      .from(assetTypes)
      .where(eq(assetTypes.isActive, true))
      .orderBy(asc(assetTypes.displayOrder));
  }
  return db.select().from(assetTypes).orderBy(asc(assetTypes.displayOrder));
}

/**
 * Verifies that the existing `assets` view returns the expected shape.
 * Used by the regression test in tests/development-stage-5-b.test.ts.
 */
export async function countAssetsViaView() {
  const db = requireDb();
  const result = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM assets
  `);
  const rows = (result as unknown as { rows: Array<{ count: string }> }).rows ?? [];
  return Number(rows[0]?.count ?? "0");
}
