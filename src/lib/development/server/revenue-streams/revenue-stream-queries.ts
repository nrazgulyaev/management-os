import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { revenueStreams } from "@/lib/db/schema/revenue-streams";

export async function listRevenueStreams(filters?: {
  assetId?: string;
  projectId?: string;
  streamType?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.assetId) {
    conditions.push(eq(revenueStreams.assetId, filters.assetId));
  }
  if (filters?.projectId) {
    conditions.push(eq(revenueStreams.projectId, filters.projectId));
  }
  if (filters?.streamType) {
    conditions.push(eq(revenueStreams.streamType, filters.streamType));
  }
  return db
    .select()
    .from(revenueStreams)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(revenueStreams.periodStart));
}

export async function getRevenueStream(id: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(revenueStreams)
    .where(eq(revenueStreams.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Aggregate revenue by month for a project (last 12 months).
 */
export async function getProjectRevenueLastYear(projectId: string) {
  const db = requireDb();
  const result = await db.execute<{
    period_start: string;
    gross: string;
    net: string;
  }>(sql`
    SELECT
      date_trunc('month', period_start)::date::text AS period_start,
      SUM(gross_revenue_minor)::text AS gross,
      SUM(net_revenue_minor)::text AS net
    FROM revenue_streams
    WHERE project_id = ${projectId}
      AND period_start >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY date_trunc('month', period_start)
    ORDER BY period_start
  `);
  return (result as unknown as { rows: Array<Record<string, string>> }).rows ??
    [];
}
