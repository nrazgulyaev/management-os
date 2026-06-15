import "server-only";

import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { productivityLogs } from "@/lib/db/schema/schedule-sophistication";

export async function listProductivityLogsForProject(projectId: string, limit = 200) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(productivityLogs)
    .where(eq(productivityLogs.projectId, projectId))
    .orderBy(desc(productivityLogs.logDate))
    .limit(limit);
}

export async function listAllProductivityLogs(limit = 200) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(productivityLogs)
    .where(eq(productivityLogs.organizationId, organizationId))
    .orderBy(desc(productivityLogs.logDate))
    .limit(limit);
}
