import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import { requireOrgId } from "@/features/auth/require-org";

export type ProjectDocumentRow = {
  id: string;
  title: string;
  documentType: string;
  fileName: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  visibility: string;
  status: string;
  createdAt: string;
};

/**
 * Documents indexed against a project (entity_type='project', entity_id=
 * projectId), scoped to the caller's org. Drives the project Documents tab.
 * Active documents first, newest first.
 */
export async function listProjectDocuments(
  projectId: string,
): Promise<ProjectDocumentRow[]> {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      documentType: documents.documentType,
      fileName: documents.fileName,
      storageBucket: documents.storageBucket,
      storagePath: documents.storagePath,
      visibility: documents.visibility,
      status: documents.status,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, organizationId),
        eq(documents.entityType, "project"),
        eq(documents.entityId, projectId),
      ),
    )
    .orderBy(desc(documents.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    documentType: r.documentType,
    fileName: r.fileName,
    storageBucket: r.storageBucket,
    storagePath: r.storagePath,
    visibility: r.visibility,
    status: r.status,
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString().slice(0, 10)
        : String(r.createdAt).slice(0, 10),
  }));
}
