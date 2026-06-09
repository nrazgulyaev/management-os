import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { securityCameraDevices } from "@/lib/db/schema/availability";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * V9A — security camera REGISTRY only. We never stream video; the app
 * exposes a vendor URL the operator clicks through. `stream_url_encrypted`
 * exists for a future encrypted-credential flow but the read path here
 * intentionally never returns it.
 */

export interface SecurityCameraDeviceRow {
  id: string;
  projectId: string | null;
  projectName: string | null;
  villaId: string | null;
  villaCode: string | null;
  name: string;
  locationLabel: string;
  provider: string | null;
  externalAppUrl: string | null;
  status: string;
  accessRole: string | null;
  lastCheckedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listSecurityCameraDevices(opts?: {
  projectId?: string;
  villaId?: string;
  status?: string;
}): Promise<SecurityCameraDeviceRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters = [eq(securityCameraDevices.organizationId, organizationId)];
  if (opts?.projectId)
    filters.push(eq(securityCameraDevices.projectId, opts.projectId));
  if (opts?.villaId)
    filters.push(eq(securityCameraDevices.villaId, opts.villaId));
  if (opts?.status) filters.push(eq(securityCameraDevices.status, opts.status));
  const rows = await db
    .select({
      d: securityCameraDevices,
      projectName: projectsTable.name,
      villaCode: villas.unitCode,
    })
    .from(securityCameraDevices)
    .leftJoin(projectsTable, eq(projectsTable.id, securityCameraDevices.projectId))
    .leftJoin(villas, eq(villas.id, securityCameraDevices.villaId))
    .where(and(...filters))
    .orderBy(asc(securityCameraDevices.name));
  return rows.map(toRow);
}

export async function getSecurityCameraDeviceById(
  id: string,
): Promise<SecurityCameraDeviceRow | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [row] = await db
    .select({
      d: securityCameraDevices,
      projectName: projectsTable.name,
      villaCode: villas.unitCode,
    })
    .from(securityCameraDevices)
    .leftJoin(projectsTable, eq(projectsTable.id, securityCameraDevices.projectId))
    .leftJoin(villas, eq(villas.id, securityCameraDevices.villaId))
    .where(
      and(
        eq(securityCameraDevices.id, id),
        eq(securityCameraDevices.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? toRow(row) : null;
}

function toRow(r: {
  d: typeof securityCameraDevices.$inferSelect;
  projectName: string | null;
  villaCode: string | null;
}): SecurityCameraDeviceRow {
  return {
    id: r.d.id,
    projectId: r.d.projectId,
    projectName: r.projectName ?? null,
    villaId: r.d.villaId,
    villaCode: r.villaCode ?? null,
    name: r.d.name,
    locationLabel: r.d.locationLabel,
    provider: r.d.provider,
    externalAppUrl: r.d.externalAppUrl,
    // NOTE: streamUrlEncrypted intentionally NOT projected.
    status: r.d.status,
    accessRole: r.d.accessRole,
    lastCheckedAt: r.d.lastCheckedAt?.toISOString() ?? null,
    notes: r.d.notes,
    createdAt: r.d.createdAt.toISOString(),
    updatedAt: r.d.updatedAt.toISOString(),
  };
}

// Re-export the pure visibility helper.
export { isOwnerSafeCameraSurface } from "./visibility";
