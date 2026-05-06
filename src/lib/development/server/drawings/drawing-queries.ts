import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  drawings,
  drawingRevisions,
  drawingDistributionLog,
} from "@/lib/db/schema/drawings";

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
