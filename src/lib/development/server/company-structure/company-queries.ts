import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  projectCompanyStructures,
  companyStructureShareholders,
} from "@/lib/db/schema/company-structures";

export async function listCompanyStructures(filters?: {
  projectId?: string;
  activeOnly?: boolean;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(projectCompanyStructures.projectId, filters.projectId));
  }
  if (filters?.activeOnly) {
    conditions.push(eq(projectCompanyStructures.isActive, true));
  }
  return db
    .select()
    .from(projectCompanyStructures)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(projectCompanyStructures.effectiveFrom));
}

export async function getCompanyStructure(id: string) {
  const db = requireDb();
  const [structure] = await db
    .select()
    .from(projectCompanyStructures)
    .where(eq(projectCompanyStructures.id, id))
    .limit(1);
  if (!structure) return null;
  const shareholders = await db
    .select()
    .from(companyStructureShareholders)
    .where(eq(companyStructureShareholders.structureId, id))
    .orderBy(desc(companyStructureShareholders.ownershipPercentage));
  return { structure, shareholders };
}

export async function getActiveStructureForProject(projectId: string) {
  const db = requireDb();
  const [structure] = await db
    .select()
    .from(projectCompanyStructures)
    .where(
      and(
        eq(projectCompanyStructures.projectId, projectId),
        eq(projectCompanyStructures.isActive, true),
      ),
    )
    .limit(1);
  return structure ?? null;
}
