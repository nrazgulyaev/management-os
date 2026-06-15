import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { specifications } from "@/lib/db/schema/specifications";
import { requireOrgId } from "@/features/auth/require-org";

export async function listSpecifications(filters?: {
  category?: string;
  vendorId?: string;
  activeOnly?: boolean;
}) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  conditions.push(eq(specifications.organizationId, organizationId));
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
  // TENANCY — specCode is globally unique; without the org filter a tenant
  // could open another tenant's specification by code. Org mismatch returns
  // null so the page notFound()s.
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(specifications)
    .where(
      and(
        eq(specifications.specCode, code),
        eq(specifications.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}
