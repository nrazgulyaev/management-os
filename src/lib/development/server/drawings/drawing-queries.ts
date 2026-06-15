import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  drawings,
  drawingRevisions,
  drawingDistributionLog,
} from "@/lib/db/schema/drawings";
import { projects } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";

export interface RecentDrawingRevision {
  revisionId: string;
  drawingCode: string;
  drawingTitle: string;
  projectName: string | null;
  revisionLabel: string;
  revisionDate: string;
  status: string;
  createdAt: Date;
}

/**
 * Most-recently-created drawing revisions across all (non-archived) drawings.
 * Powers the "Recent drawing revisions" roll-up on the Knowledge overview.
 */
export async function listRecentDrawingRevisions(
  limit = 8,
): Promise<RecentDrawingRevision[]> {
  const db = requireDb();
  // TENANCY — scope the revisions roll-up to the caller's org so one tenant
  // can't read another tenant's recent drawing revisions.
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      revisionId: drawingRevisions.id,
      drawingCode: drawings.drawingCode,
      drawingTitle: drawings.title,
      projectName: projects.name,
      revisionLabel: drawingRevisions.revisionLabel,
      revisionDate: drawingRevisions.revisionDate,
      status: drawingRevisions.status,
      createdAt: drawingRevisions.createdAt,
    })
    .from(drawingRevisions)
    .innerJoin(drawings, eq(drawings.id, drawingRevisions.drawingId))
    .leftJoin(projects, eq(projects.id, drawings.projectId))
    .where(
      and(
        eq(drawings.isArchived, false),
        eq(drawingRevisions.organizationId, organizationId),
      ),
    )
    .orderBy(desc(drawingRevisions.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    revisionId: r.revisionId,
    drawingCode: r.drawingCode,
    drawingTitle: r.drawingTitle,
    projectName: r.projectName ?? null,
    revisionLabel: r.revisionLabel,
    revisionDate: r.revisionDate,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

export async function listDrawings(filters?: {
  projectId?: string;
  villaId?: string;
  drawingType?: string;
  drawingPhase?: string;
  archivedOnly?: boolean;
}) {
  const db = requireDb();
  // TENANCY — scope the drawings list to the caller's org.
  const organizationId = await requireOrgId();
  const conditions = [eq(drawings.organizationId, organizationId)] as Array<
    ReturnType<typeof eq>
  >;
  if (filters?.projectId) {
    conditions.push(eq(drawings.projectId, filters.projectId));
  }
  if (filters?.villaId) {
    conditions.push(eq(drawings.villaId, filters.villaId));
  }
  if (filters?.drawingType) {
    conditions.push(eq(drawings.drawingType, filters.drawingType));
  }
  if (filters?.drawingPhase) {
    conditions.push(eq(drawings.drawingPhase, filters.drawingPhase));
  }
  conditions.push(eq(drawings.isArchived, filters?.archivedOnly ?? false));
  return db
    .select()
    .from(drawings)
    .where(and(...conditions))
    .orderBy(asc(drawings.drawingCode));
}

export async function getDrawingByCode(code: string) {
  const db = requireDb();
  // TENANCY — drawingCode is globally unique; without the org filter a tenant
  // could open another tenant's drawing detail page by code. Org mismatch
  // returns null so the page notFound()s.
  const organizationId = await requireOrgId();
  const [d] = await db
    .select()
    .from(drawings)
    .where(
      and(
        eq(drawings.drawingCode, code),
        eq(drawings.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!d) return null;
  const revisions = await db
    .select()
    .from(drawingRevisions)
    .where(
      and(
        eq(drawingRevisions.drawingId, d.id),
        eq(drawingRevisions.organizationId, organizationId),
      ),
    )
    .orderBy(desc(drawingRevisions.revisionDate));
  return { drawing: d, revisions };
}

export async function getDrawingRevision(input: {
  drawingId: string;
  revisionLabel: string;
}) {
  const db = requireDb();
  // TENANCY — scope the revision + its distribution log to the caller's org so
  // a forged drawingId can't open another tenant's revision detail.
  const organizationId = await requireOrgId();
  const [rev] = await db
    .select()
    .from(drawingRevisions)
    .where(
      and(
        eq(drawingRevisions.drawingId, input.drawingId),
        eq(drawingRevisions.revisionLabel, input.revisionLabel),
        eq(drawingRevisions.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!rev) return null;
  const distribution = await db
    .select()
    .from(drawingDistributionLog)
    .where(
      and(
        eq(drawingDistributionLog.revisionId, rev.id),
        eq(drawingDistributionLog.organizationId, organizationId),
      ),
    )
    .orderBy(desc(drawingDistributionLog.distributedAt));
  return { revision: rev, distribution };
}

export async function listDistributionForDrawing(drawingId: string) {
  const db = requireDb();
  // TENANCY — scope the distribution log to the caller's org so one tenant
  // can't read another tenant's distribution records by passing a foreign
  // drawingId.
  const organizationId = await requireOrgId();
  return db
    .select({
      id: drawingDistributionLog.id,
      revisionId: drawingDistributionLog.revisionId,
      revisionLabel: drawingRevisions.revisionLabel,
      vendorId: drawingDistributionLog.vendorId,
      distributedAt: drawingDistributionLog.distributedAt,
      distributionMethod: drawingDistributionLog.distributionMethod,
      acknowledgedAt: drawingDistributionLog.acknowledgedAt,
    })
    .from(drawingDistributionLog)
    .innerJoin(
      drawingRevisions,
      eq(drawingRevisions.id, drawingDistributionLog.revisionId),
    )
    .where(
      and(
        eq(drawingRevisions.drawingId, drawingId),
        eq(drawingDistributionLog.organizationId, organizationId),
      ),
    )
    .orderBy(desc(drawingDistributionLog.distributedAt));
}
