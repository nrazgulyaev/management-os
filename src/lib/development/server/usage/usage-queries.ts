import "server-only";

import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { usageMetrics } from "@/lib/db/schema/saas";

export async function listUsageMetricsForOrg(
  organizationId: string,
  opts: { limit?: number; metricType?: string } = {},
) {
  const db = getDb();
  if (!db) return [];
  const conds = [eq(usageMetrics.organizationId, organizationId)];
  if (opts.metricType) {
    conds.push(eq(usageMetrics.metricType, opts.metricType));
  }
  return db
    .select()
    .from(usageMetrics)
    .where(and(...conds))
    .orderBy(desc(usageMetrics.metricPeriodStart))
    .limit(opts.limit ?? 90);
}

export async function getUsageMetricsForPeriod(
  organizationId: string,
  args: {
    metricType: "daily_summary" | "weekly_summary" | "monthly_summary";
    periodStart: string; // YYYY-MM-DD
    periodEnd: string; // YYYY-MM-DD
  },
) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(usageMetrics)
    .where(
      and(
        eq(usageMetrics.organizationId, organizationId),
        eq(usageMetrics.metricType, args.metricType),
        gte(usageMetrics.metricPeriodStart, args.periodStart),
        lte(usageMetrics.metricPeriodEnd, args.periodEnd),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listUsageMetricsAcrossOrgs(opts: { limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(usageMetrics)
    .orderBy(desc(usageMetrics.metricPeriodStart))
    .limit(opts.limit ?? 200);
}
