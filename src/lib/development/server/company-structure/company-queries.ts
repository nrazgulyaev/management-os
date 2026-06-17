import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  projectCompanyStructures,
  companyStructureShareholders,
} from "@/lib/db/schema/company-structures";
import { requireOrgId } from "@/features/auth/require-org";

export async function listCompanyStructures(filters?: {
  projectId?: string;
  activeOnly?: boolean;
}) {
  const db = requireDb();
  // TENANCY — always scope to the caller's org so the catalog cannot list
  // another tenant's structures.
  const organizationId = await requireOrgId();
  const conditions = [
    eq(projectCompanyStructures.organizationId, organizationId),
  ] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(projectCompanyStructures.projectId, filters.projectId));
  }
  if (filters?.activeOnly) {
    conditions.push(eq(projectCompanyStructures.isActive, true));
  }
  return db
    .select()
    .from(projectCompanyStructures)
    .where(and(...conditions))
    .orderBy(desc(projectCompanyStructures.effectiveFrom));
}

export async function getCompanyStructure(id: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [structure] = await db
    .select()
    .from(projectCompanyStructures)
    .where(
      and(
        eq(projectCompanyStructures.id, id),
        eq(projectCompanyStructures.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!structure) return null;
  const shareholders = await db
    .select()
    .from(companyStructureShareholders)
    .where(
      and(
        eq(companyStructureShareholders.structureId, id),
        eq(companyStructureShareholders.organizationId, organizationId),
      ),
    )
    .orderBy(desc(companyStructureShareholders.ownershipPercentage));
  return { structure, shareholders };
}

export async function getActiveStructureForProject(projectId: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [structure] = await db
    .select()
    .from(projectCompanyStructures)
    .where(
      and(
        eq(projectCompanyStructures.projectId, projectId),
        eq(projectCompanyStructures.organizationId, organizationId),
        eq(projectCompanyStructures.isActive, true),
      ),
    )
    .limit(1);
  return structure ?? null;
}
