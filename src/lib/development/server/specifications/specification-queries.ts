import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { specifications } from "@/lib/db/schema/specifications";

export async function listSpecifications(filters?: {
  category?: string;
  vendorId?: string;
  activeOnly?: boolean;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.activeOnly !== false) {
    conditions.push(eq(specifications.isActive, true));
  }
  if (filters?.category) {
    conditions.push(eq(specifications.specCategory, filters.category));
  }
  if (filters?.vendorId) {
    conditions.push(eq(specifications.preferredVendorId, filters.vendorId));
  }
  return db
    .select()
    .from(specifications)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(specifications.specCode));
}

export async function getSpecificationByCode(code: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(specifications)
    .where(eq(specifications.specCode, code))
    .limit(1);
  return row ?? null;
}
