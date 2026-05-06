import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { methodStatements } from "@/lib/db/schema/method-quality";

export async function listMethodStatements(filters?: {
  category?: string;
  status?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.category) {
    conditions.push(eq(methodStatements.category, filters.category));
  }
  if (filters?.status) {
    conditions.push(eq(methodStatements.status, filters.status));
  }
  return db
    .select()
    .from(methodStatements)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(methodStatements.methodCode));
}

export async function getMethodStatementByCode(code: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(methodStatements)
    .where(eq(methodStatements.methodCode, code))
    .limit(1);
  return row ?? null;
}
