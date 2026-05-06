import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devCostCategories, devTransactions } from "@/lib/db/schema/dev-finance";

export type CostCategory = typeof devCostCategories.$inferSelect;

export async function getCostCategories(): Promise<CostCategory[]> {
  const db = getDb();
  if (!db) return [];
  return await db
    .select()
    .from(devCostCategories)
    .orderBy(devCostCategories.displayOrder, devCostCategories.categoryCode);
}

export async function getCostCategory(id: string): Promise<CostCategory | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(devCostCategories)
    .where(eq(devCostCategories.id, id))
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
