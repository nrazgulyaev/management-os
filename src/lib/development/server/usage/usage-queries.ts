import "server-only";

import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { usageMetrics } from "@/lib/db/schema/saas";
import { AuthorizationError } from "@/features/auth/permissions";
import { isSuperAdminContext } from "@/features/auth/require-super-admin";

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

/**
 * TENANT-1 — platform-admin ONLY. This returns usage volumes for EVERY
 * org (user/project/tx/invoice/AI/API/webhook counts) and is the data
 * source for the /development-os/platform/usage page. The page's only
 * gate was enforceProductAccess('dev'), so any dev-product tenant user
 * could read every org's metrics. Gate it here on the PLATFORM-admin
 * allowlist (isSuperAdminContext) so neither a regular tenant user NOR a
 * tenant admin (who also holds the super_admin role) can reach the
 * cross-org view even by invoking this function directly. Tenant callers
 * must use listUsageMetricsForOrg(orgId) instead.
 */
export async function listUsageMetricsAcrossOrgs(opts: { limit?: number } = {}) {
  const { ok: isPlatformAdmin } = await isSuperAdminContext();
  if (!isPlatformAdmin) {
    throw new AuthorizationError("Platform-admin access required");
  }
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(usageMetrics)
    .orderBy(desc(usageMetrics.metricPeriodStart))
    .limit(opts.limit ?? 200);
}
