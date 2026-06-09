import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  drawings,
  drawingRevisions,
  drawingDistributionLog,
} from "@/lib/db/schema/drawings";
import { projects } from "@/lib/db/schema/projects";

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
    .where(eq(drawings.isArchived, false))
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
  const conditions = [] as Array<ReturnType<typeof eq>>;
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
  const [d] = await db
    .select()
    .from(drawings)
    .where(eq(drawings.drawingCode, code))
    .limit(1);
  if (!d) return null;
  const revisions = await db
    .select()
    .from(drawingRevisions)
    .where(eq(drawingRevisions.drawingId, d.id))
    .orderBy(desc(drawingRevisions.revisionDate));
  return { drawing: d, revisions };
}

export async function getDrawingRevision(input: {
  drawingId: string;
  revisionLabel: string;
}) {
  const db = requireDb();
  const [rev] = await db
    .select()
    .from(drawingRevisions)
    .where(
      and(
        eq(drawingRevisions.drawingId, input.drawingId),
        eq(drawingRevisions.revisionLabel, input.revisionLabel),
      ),
    )
    .limit(1);
  if (!rev) return null;
  const distribution = await db
    .select()
    .from(drawingDistributionLog)
    .where(eq(drawingDistributionLog.revisionId, rev.id))
    .orderBy(desc(drawingDistributionLog.distributedAt));
  return { revision: rev, distribution };
}

export async function listDistributionForDrawing(drawingId: string) {
  const db = requireDb();
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
    .where(eq(drawingRevisions.drawingId, drawingId))
    .orderBy(desc(drawingDistributionLog.distributedAt));
}
