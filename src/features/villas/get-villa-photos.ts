import "server-only";

import { asc, eq } from "drizzle-orm";
import { and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { villas, projects } from "@/lib/db/schema/projects";
import { villaPhotos } from "@/lib/db/schema/villa-photos";

export interface VillaPhotoRow {
  id: string;
  url: string;
  caption: string | null;
  kind: string;
  position: number;
}

/**
 * Photos for a villa, for the management edit page. Tenancy: proves the villa
 * belongs to the caller's org (villas have no org column — via project) BEFORE
 * returning anything; returns [] for a cross-org / unknown villa.
 */
export async function listVillaPhotos(villaId: string): Promise<VillaPhotoRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const [owns] = await db
    .select({ id: villas.id })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(and(eq(villas.id, villaId), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!owns) return [];

  return db
    .select({
      id: villaPhotos.id,
      url: villaPhotos.url,
      caption: villaPhotos.caption,
      kind: villaPhotos.kind,
      position: villaPhotos.position,
    })
    .from(villaPhotos)
    .where(eq(villaPhotos.villaId, villaId))
    .orderBy(asc(villaPhotos.position), asc(villaPhotos.createdAt));
}
