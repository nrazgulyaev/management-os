import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { qualityStandards } from "@/lib/db/schema/method-quality";
import { requireOrgId } from "@/features/auth/require-org";

export async function listQualityStandards(filters?: {
  category?: string;
  activeOnly?: boolean;
}) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const conditions = [
    eq(qualityStandards.organizationId, organizationId),
  ] as Array<ReturnType<typeof eq>>;
  if (filters?.activeOnly !== false) {
    conditions.push(eq(qualityStandards.isActive, true));
  }
  if (filters?.category) {
    conditions.push(eq(qualityStandards.category, filters.category));
  }
  return db
    .select()
    .from(qualityStandards)
    .where(and(...conditions))
    .orderBy(asc(qualityStandards.standardCode));
}

export async function getQualityStandardByCode(code: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(qualityStandards)
    .where(
      and(
        eq(qualityStandards.standardCode, code),
        eq(qualityStandards.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}
