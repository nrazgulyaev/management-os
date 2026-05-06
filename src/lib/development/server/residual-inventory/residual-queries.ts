import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  residualInventoryUnits,
  residualUnitOwnershipShares,
} from "@/lib/db/schema/residual-inventory";

export async function listResidualUnits(filters?: {
  projectId?: string;
  status?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(residualInventoryUnits.projectId, filters.projectId));
  }
  if (filters?.status) {
    conditions.push(eq(residualInventoryUnits.status, filters.status));
  }
  return db
    .select()
    .from(residualInventoryUnits)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(residualInventoryUnits.becameResidualAt));
}

export async function getResidualUnit(id: string) {
  const db = requireDb();
  const [unit] = await db
    .select()
    .from(residualInventoryUnits)
    .where(eq(residualInventoryUnits.id, id))
    .limit(1);
  if (!unit) return null;
  const shares = await db
    .select()
    .from(residualUnitOwnershipShares)
    .where(eq(residualUnitOwnershipShares.residualUnitId, id))
    .orderBy(desc(residualUnitOwnershipShares.ownershipPercentage));
  return { unit, shares };
}

export async function listInvestorResidualShares(investorId: string) {
  const db = requireDb();
  return db
    .select()
    .from(residualUnitOwnershipShares)
    .where(eq(residualUnitOwnershipShares.investorId, investorId))
    .orderBy(desc(residualUnitOwnershipShares.economicClaimMinor));
}
