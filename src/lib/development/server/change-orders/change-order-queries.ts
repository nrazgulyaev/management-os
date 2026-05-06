import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { changeOrders } from "@/lib/db/schema/project-memory";

export async function listChangeOrders(filters?: {
  projectId?: string;
  status?: string;
  initiatedByType?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(changeOrders.projectId, filters.projectId));
  }
  if (filters?.status) {
    conditions.push(eq(changeOrders.status, filters.status));
  }
  if (filters?.initiatedByType) {
    conditions.push(eq(changeOrders.initiatedByType, filters.initiatedByType));
  }
  return db
    .select()
    .from(changeOrders)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(changeOrders.requestedAt));
}

export async function getChangeOrderByCode(changeOrderCode: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(changeOrders)
    .where(eq(changeOrders.changeOrderCode, changeOrderCode))
    .limit(1);
  return row ?? null;
}
