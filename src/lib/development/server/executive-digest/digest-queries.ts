import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { executiveDigests } from "@/lib/db/schema/executive";

export async function listDigests(limit = 24) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(executiveDigests)
    .orderBy(desc(executiveDigests.periodEnd))
    .limit(limit);
}

export async function getDigestByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(executiveDigests)
    .where(eq(executiveDigests.digestCode, code))
    .limit(1);
  return rows[0] ?? null;
}
