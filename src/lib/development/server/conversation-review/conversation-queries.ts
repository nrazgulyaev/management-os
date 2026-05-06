import "server-only";

import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  salesConversationThreads,
  managerPerformanceMetrics,
} from "@/lib/db/schema/marketing";

export async function listConversationThreads(limit = 100) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(salesConversationThreads)
    .orderBy(desc(salesConversationThreads.lastMessageAt))
    .limit(limit);
}

export async function getThreadByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(salesConversationThreads)
    .where(eq(salesConversationThreads.threadCode, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function listManagerPerformance(opts: { managerId?: string; limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  const q = db
    .select()
    .from(managerPerformanceMetrics)
    .orderBy(desc(managerPerformanceMetrics.periodStart))
    .limit(opts.limit ?? 100);
  if (opts.managerId) {
    return q.where(eq(managerPerformanceMetrics.managerId, opts.managerId));
  }
  return q;
}
