import "server-only";

import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  salesConversationThreads,
  managerPerformanceMetrics,
} from "@/lib/db/schema/marketing";
import { requireOrgId } from "@/features/auth/require-org";

export async function listConversationThreads(limit = 100) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(salesConversationThreads)
    .where(eq(salesConversationThreads.organizationId, organizationId))
    .orderBy(desc(salesConversationThreads.lastMessageAt))
    .limit(limit);
}

export async function getThreadByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(salesConversationThreads)
    .where(
      and(
        eq(salesConversationThreads.threadCode, code),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listManagerPerformance(opts: { managerId?: string; limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const where = opts.managerId
    ? and(
        eq(managerPerformanceMetrics.organizationId, organizationId),
        eq(managerPerformanceMetrics.managerId, opts.managerId),
      )
    : eq(managerPerformanceMetrics.organizationId, organizationId);
  return db
    .select()
    .from(managerPerformanceMetrics)
    .where(where)
    .orderBy(desc(managerPerformanceMetrics.periodStart))
    .limit(opts.limit ?? 100);
}
