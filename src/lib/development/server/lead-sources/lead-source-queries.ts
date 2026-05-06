import "server-only";

import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { marketingLeadSources } from "@/lib/db/schema/marketing";

export async function listLeadSources(opts: { activeOnly?: boolean } = {}) {
  const db = getDb();
  if (!db) return [];
  const q = db
    .select()
    .from(marketingLeadSources)
    .orderBy(desc(marketingLeadSources.isActive), marketingLeadSources.displayName);
  if (opts.activeOnly) {
    return q.where(eq(marketingLeadSources.isActive, true));
  }
  return q;
}

export async function getLeadSourceByKey(sourceKey: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(marketingLeadSources)
    .where(eq(marketingLeadSources.sourceKey, sourceKey))
    .limit(1);
  return rows[0] ?? null;
}
