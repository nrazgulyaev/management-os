import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import type { WithSource } from "@/features/types";

export interface DocumentRow {
  id: string;
  title: string;
  documentType: string;
  entityType: string;
  entityId: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  visibility: "internal" | "owner" | "guest" | "public";
  status: "active" | "archived";
  createdAt: string;
}

export async function listDocuments(opts?: {
  entityType?: string;
  entityId?: string;
}): Promise<WithSource<DocumentRow>[]> {
  const db = getDb();
  if (!db) return [];

  const where =
    opts?.entityType && opts.entityId
      ? and(
          eq(documents.entityType, opts.entityType),
          eq(documents.entityId, opts.entityId),
        )
      : undefined;

  const rows = await db
    .select()
    .from(documents)
    .where(where ?? undefined)
    .orderBy(desc(documents.createdAt));

  return rows.map((r) => ({
    source: "db",
    id: r.id,
    title: r.title,
    documentType: r.documentType,
    entityType: r.entityType,
    entityId: r.entityId,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    visibility: r.visibility as DocumentRow["visibility"],
    status: (r.status as "active" | "archived") ?? "active",
    createdAt: r.createdAt.toISOString(),
  }));
}
