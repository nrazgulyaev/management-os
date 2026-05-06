import "server-only";

import { eq, desc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contentPieces, contentVariants } from "@/lib/db/schema/marketing";

export async function listContent(opts: { status?: string[]; limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  const q = db
    .select()
    .from(contentPieces)
    .orderBy(desc(contentPieces.createdAt))
    .limit(opts.limit ?? 200);
  if (opts.status && opts.status.length > 0) {
    return q.where(inArray(contentPieces.status, opts.status));
  }
  return q;
}

export async function getContentByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(contentPieces)
    .where(eq(contentPieces.contentCode, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function listContentVariants(parentId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(contentVariants)
    .where(eq(contentVariants.parentContentId, parentId));
}
