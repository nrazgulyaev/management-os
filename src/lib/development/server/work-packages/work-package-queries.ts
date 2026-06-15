import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { workPackages } from "@/lib/db/schema/work-packages";

export async function listWorkPackages(filters?: {
  projectId?: string;
  status?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(workPackages.projectId, filters.projectId));
  }
  if (filters?.status) {
    conditions.push(eq(workPackages.status, filters.status));
  }
  return db
    .select()
    .from(workPackages)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(workPackages.displayOrder), asc(workPackages.packageCode));
}

export async function getWorkPackageByCode(packageCode: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(workPackages)
    .where(
      and(
        eq(workPackages.packageCode, packageCode),
        eq(workPackages.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}
