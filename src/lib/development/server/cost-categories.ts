import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devCostCategories, devTransactions } from "@/lib/db/schema/dev-finance";
import { requireOrgId } from "@/features/auth/require-org";

export type CostCategory = typeof devCostCategories.$inferSelect;

export async function getCostCategories(): Promise<CostCategory[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY: dev_cost_categories.organization_id is NOT NULL. All callers are
  // tenant finance/boq request pages (no cron/sync), so hard-scope by org.
  const orgId = await requireOrgId();
  return await db
    .select()
    .from(devCostCategories)
    .where(eq(devCostCategories.organizationId, orgId))
    .orderBy(devCostCategories.displayOrder, devCostCategories.categoryCode);
}

export async function getCostCategory(id: string): Promise<CostCategory | null> {
  const db = getDb();
  if (!db) return null;
  // TENANCY: id is client-supplied — scope the lookup to the caller's org.
  const orgId = await requireOrgId();
  const [r] = await db
    .select()
    .from(devCostCategories)
    .where(
      and(
        eq(devCostCategories.id, id),
        eq(devCostCategories.organizationId, orgId),
      ),
    )
    .limit(1);
  return r ?? null;
}

/**
 * Per-category transaction-count + USD-amount summary. Used by the
 * categories page to surface "is this category in use, and how heavily?"
 * — answers the operator question "can I safely retire this category?".
 *
 * Returns rows keyed by category_id; categories with zero transactions
 * are omitted (page-side reconciliation overlays zeros).
 */
export async function getCostCategoryUsage(): Promise<
  Array<{ categoryId: string; transactionCount: number; totalUsdMinor: string }>
> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      categoryId: devTransactions.categoryId,
      transactionCount: sql<number>`count(*)::int`.as("transaction_count"),
      totalUsdMinor: sql<string>`coalesce(sum(${devTransactions.amountUsdMinor}), 0)::text`.as(
        "total_usd_minor",
      ),
    })
    .from(devTransactions)
    .where(sql`${devTransactions.categoryId} IS NOT NULL`)
    .groupBy(devTransactions.categoryId);
  return rows
    .filter((r): r is { categoryId: string; transactionCount: number; totalUsdMinor: string } =>
      r.categoryId != null,
    )
    .map((r) => ({
      categoryId: r.categoryId,
      transactionCount: Number(r.transactionCount),
      totalUsdMinor: r.totalUsdMinor,
    }));
}
