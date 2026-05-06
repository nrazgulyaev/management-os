import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devCostCategories } from "@/lib/db/schema/dev-finance";

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
