import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { projectDecisions } from "@/lib/db/schema/project-memory";

export async function listProjectDecisions(filters?: {
  projectId?: string;
  status?: string;
  category?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(projectDecisions.projectId, filters.projectId));
  }
  if (filters?.status) {
    conditions.push(eq(projectDecisions.status, filters.status));
  }
  if (filters?.category) {
    conditions.push(eq(projectDecisions.category, filters.category));
  }
  return db
    .select()
    .from(projectDecisions)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(projectDecisions.decisionDate));
}

export async function getProjectDecisionByCode(decisionCode: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(projectDecisions)
    .where(eq(projectDecisions.decisionCode, decisionCode))
    .limit(1);
  return row ?? null;
}
