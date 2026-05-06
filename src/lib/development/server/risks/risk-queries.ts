import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { projectRisks } from "@/lib/db/schema/project-memory";

export async function listProjectRisks(filters?: {
  projectId?: string;
  status?: string;
  category?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(projectRisks.projectId, filters.projectId));
  }
  if (filters?.status) {
    conditions.push(eq(projectRisks.mitigationStatus, filters.status));
  }
  if (filters?.category) {
    conditions.push(eq(projectRisks.category, filters.category));
  }
  // Highest risk first.
  return db
    .select()
    .from(projectRisks)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(projectRisks.riskScore));
}

export async function getProjectRiskByCode(riskCode: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(projectRisks)
    .where(eq(projectRisks.riskCode, riskCode))
    .limit(1);
  return row ?? null;
}
