import "server-only";

import { and, eq, desc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contentPieces, contentVariants } from "@/lib/db/schema/marketing";
import { requireOrgId } from "@/features/auth/require-org";

export async function listContent(opts: { status?: string[]; limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const q = db
    .select()
    .from(contentPieces)
    .orderBy(desc(contentPieces.createdAt))
    .limit(opts.limit ?? 200);
  if (opts.status && opts.status.length > 0) {
    return q.where(
      and(
        eq(contentPieces.organizationId, organizationId),
        inArray(contentPieces.status, opts.status),
      ),
    );
  }
  return q.where(eq(contentPieces.organizationId, organizationId));
}

export async function getContentByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(contentPieces)
    .where(
      and(
        eq(contentPieces.contentCode, code),
        eq(contentPieces.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listContentVariants(parentId: string) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(contentVariants)
    .where(
      and(
        eq(contentVariants.parentContentId, parentId),
        eq(contentVariants.organizationId, organizationId),
      ),
    );
}
