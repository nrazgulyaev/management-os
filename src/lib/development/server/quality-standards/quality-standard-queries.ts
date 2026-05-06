import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { qualityStandards } from "@/lib/db/schema/method-quality";

export async function listQualityStandards(filters?: {
  category?: string;
  activeOnly?: boolean;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.activeOnly !== false) {
    conditions.push(eq(qualityStandards.isActive, true));
  }
  if (filters?.category) {
    conditions.push(eq(qualityStandards.category, filters.category));
  }
  return db
    .select()
    .from(qualityStandards)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(qualityStandards.standardCode));
}

export async function getQualityStandardByCode(code: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(qualityStandards)
    .where(eq(qualityStandards.standardCode, code))
    .limit(1);
  return row ?? null;
}
