import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import { getOwnerIdsForCurrentUser } from "@/features/access-grants/services";
import { getOwnerOrgId } from "@/features/owner-portal/owner-context";

/**
 * Per-document authorization for the owner portal download route.
 *
 * The shared /api/documents/[id]/download endpoint only org-scopes, which lets
 * one owner enumerate another owner's (or an internal-only) document. The owner
 * download route re-verifies, using the SAME predicate as the owner documents
 * listing (get-documents.ts): the doc must be either tagged to one of this
 * user's own owner records, OR org-bounded owner-visible. Returns false when
 * the user has no owner grant or the doc fails the scope.
 */
export async function ownerCanAccessDocument(documentId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const ownerIds = await getOwnerIdsForCurrentUser();
  if (ownerIds.length === 0) return false;
  const organizationId = await getOwnerOrgId(ownerIds[0]);

  const ownerTagged = and(
    eq(documents.entityType, "owner"),
    inArray(documents.entityId, ownerIds),
  );
  const orgVisible = organizationId
    ? and(
        eq(documents.visibleToOwner, true),
        eq(documents.organizationId, organizationId),
      )
    : null;

  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.status, "active"),
        orgVisible ? or(ownerTagged, orgVisible) : ownerTagged,
      ),
    )
    .limit(1);
  return Boolean(row);
}
