import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { methodStatements } from "@/lib/db/schema/method-quality";

export async function listMethodStatements(filters?: {
  category?: string;
  status?: string;
}) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const conditions = [
    eq(methodStatements.organizationId, organizationId),
  ] as Array<ReturnType<typeof eq>>;
  if (filters?.category) {
    conditions.push(eq(methodStatements.category, filters.category));
  }
  if (filters?.status) {
    conditions.push(eq(methodStatements.status, filters.status));
  }
  return db
    .select()
    .from(methodStatements)
    .where(and(...conditions))
    .orderBy(asc(methodStatements.methodCode));
}

export async function getMethodStatementByCode(code: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(methodStatements)
    .where(
      and(
        eq(methodStatements.methodCode, code),
        eq(methodStatements.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}
