import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  residualInventoryUnits,
  residualUnitOwnershipShares,
} from "@/lib/db/schema/residual-inventory";
import { requireOrgId } from "@/features/auth/require-org";

export async function listResidualUnits(filters?: {
  projectId?: string;
  status?: string;
}) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const conditions = [
    eq(residualInventoryUnits.organizationId, organizationId),
  ] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(residualInventoryUnits.projectId, filters.projectId));
  }
  if (filters?.status) {
    conditions.push(eq(residualInventoryUnits.status, filters.status));
  }
  return db
    .select()
    .from(residualInventoryUnits)
    .where(and(...conditions))
    .orderBy(desc(residualInventoryUnits.becameResidualAt));
}

export async function getResidualUnit(id: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [unit] = await db
    .select()
    .from(residualInventoryUnits)
    .where(
      and(
        eq(residualInventoryUnits.id, id),
        eq(residualInventoryUnits.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!unit) return null;
  const shares = await db
    .select()
    .from(residualUnitOwnershipShares)
    .where(
      and(
        eq(residualUnitOwnershipShares.residualUnitId, id),
        eq(residualUnitOwnershipShares.organizationId, organizationId),
      ),
    )
    .orderBy(desc(residualUnitOwnershipShares.ownershipPercentage));
  return { unit, shares };
}

export async function listInvestorResidualShares(investorId: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(residualUnitOwnershipShares)
    .where(
      and(
        eq(residualUnitOwnershipShares.investorId, investorId),
        eq(residualUnitOwnershipShares.organizationId, organizationId),
      ),
    )
    .orderBy(desc(residualUnitOwnershipShares.economicClaimMinor));
}
