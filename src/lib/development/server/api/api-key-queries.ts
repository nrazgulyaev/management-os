import "server-only";

import { eq, desc, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema/saas";

export async function listApiKeysForOrg(organizationId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function getActiveApiKeyByHash(keyHash: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);
  return rows[0] ?? null;
}
