import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { projectRisks } from "@/lib/db/schema/project-memory";
import { requireOrgId } from "@/features/auth/require-org";

export async function listProjectRisks(filters?: {
  projectId?: string;
  status?: string;
  category?: string;
}) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const conditions = [
    eq(projectRisks.organizationId, organizationId),
  ] as Array<ReturnType<typeof eq>>;
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
    .where(and(...conditions))
    .orderBy(desc(projectRisks.riskScore));
}

export async function getProjectRiskByCode(riskCode: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(projectRisks)
    .where(
      and(
        eq(projectRisks.riskCode, riskCode),
        eq(projectRisks.organizationId, organizationId),
      ),
    )
    .limit(1);
  // Cross-org code → null so the page notFound()s.
  return row ?? null;
}
