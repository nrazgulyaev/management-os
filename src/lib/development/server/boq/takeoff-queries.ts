import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  takeoffMeasurements,
  type TakeoffGeometryPoint,
  type TakeoffScaleSnapshot,
} from "@/lib/db/schema/takeoff-measurements";
import { drawings, drawingRevisions } from "@/lib/db/schema/drawings";
import { boqItems } from "@/lib/db/schema/boq";
import { projects } from "@/lib/db/schema/projects";

/**
 * Block 09 ESTIMATOR readers. All org-scoping is enforced at the action layer
 * (these run inside server actions that have already resolved requireOrgId);
 * the readers themselves are plain joins over the org-scoped tables.
 */

export interface TakeoffRevisionOption {
  revisionId: string;
  /** "DWG-001 R3 · Ground floor plan (Aria Estate)". */
  label: string;
  drawingId: string;
  drawingCode: string;
  drawingTitle: string;
  revisionLabel: string;
  revisionDate: string;
  status: string;
  /** True when a newer (later-dated, or same-date later-created) revision of
   * the SAME drawing exists — measuring against a stale revision is allowed
   * but surfaced. */
  isLatest: boolean;
}

/**
 * Drawing revisions across the org, newest first, each tagged with whether it
 * is the latest revision of its drawing. Powers the takeoff revision picker.
 */
export async function listTakeoffRevisionOptions(
  orgId: string,
  limit = 60,
): Promise<TakeoffRevisionOption[]> {
  const db = requireDb();
  const rows = await db
    .select({
      revisionId: drawingRevisions.id,
      drawingId: drawings.id,
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
        eq(drawings.organizationId, orgId),
        eq(drawings.isArchived, false),
      ),
    )
    .orderBy(desc(drawingRevisions.revisionDate), desc(drawingRevisions.createdAt));

  // Latest = first row per drawing in the (revisionDate desc, createdAt desc)
  // order above.
  const seenDrawing = new Set<string>();
  return rows.map((r) => {
    const isLatest = !seenDrawing.has(r.drawingId);
    seenDrawing.add(r.drawingId);
    const project = r.projectName ? ` (${r.projectName})` : "";
    return {
      revisionId: r.revisionId,
      drawingId: r.drawingId,
      drawingCode: r.drawingCode,
      drawingTitle: r.drawingTitle,
      revisionLabel: r.revisionLabel,
      revisionDate: r.revisionDate,
      status: r.status,
      isLatest,
      label: `${r.drawingCode} ${r.revisionLabel} · ${r.drawingTitle}${project}`,
    };
  }).slice(0, limit);
}

export interface PersistedTakeoff {
  id: string;
  drawingRevisionId: string;
  label: string;
  kind: "area" | "length" | "count";
  unitOfMeasure: string;
  assembly: string | null;
  rawQuantity: number;
  unitRateMinor: bigint;
  currency: string;
  /** quantity × rate, MINOR units, derived here. */
  lineCostMinor: bigint;
  geometry: TakeoffGeometryPoint[];
  scaleSnapshot: TakeoffScaleSnapshot | null;
  boqItemId: string | null;
  boqSectionId: string | null;
  /** True once the linked BOQ line was deleted out from under the takeoff. */
  boqLineMissing: boolean;
  notes: string | null;
  /** True when a newer revision of the SAME drawing exists ⇒ re-measure. */
  isStale: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Persisted measurements for a single drawing revision, costed + stale-checked.
 * `isStale` is TRUE when a strictly-newer revision of the same drawing exists,
 * so the workbench can flag "a new revision landed — re-measure".
 */
export async function listTakeoffsForRevision(
  orgId: string,
  revisionId: string,
): Promise<PersistedTakeoff[]> {
  const db = requireDb();

  // Resolve the drawing + this revision's ordering keys so we can detect a
  // strictly-newer sibling revision.
  const [rev] = await db
    .select({
      drawingId: drawingRevisions.drawingId,
      revisionDate: drawingRevisions.revisionDate,
      createdAt: drawingRevisions.createdAt,
    })
    .from(drawingRevisions)
    .where(eq(drawingRevisions.id, revisionId))
    .limit(1);

  let isStale = false;
  if (rev) {
    const [{ newer }] = await db
      .select({ newer: sql<number>`count(*)::int` })
      .from(drawingRevisions)
      .where(
        and(
          eq(drawingRevisions.drawingId, rev.drawingId),
          sql`(${drawingRevisions.revisionDate}, ${drawingRevisions.createdAt}) > (${rev.revisionDate}, ${rev.createdAt})`,
        ),
      );
    isStale = newer > 0;
  }

  const rows = await db
    .select({
      m: takeoffMeasurements,
      boqItemId: boqItems.id,
    })
    .from(takeoffMeasurements)
    .leftJoin(boqItems, eq(boqItems.id, takeoffMeasurements.boqItemId))
    .where(
      and(
        eq(takeoffMeasurements.organizationId, orgId),
        eq(takeoffMeasurements.drawingRevisionId, revisionId),
      ),
    )
    .orderBy(asc(takeoffMeasurements.createdAt));

  return rows.map(({ m, boqItemId }) => {
    const qty = Number(m.rawQuantity ?? 0);
    const rate = m.unitRateMinor ?? 0n;
    const lineCostMinor = BigInt(Math.round(qty * Number(rate)));
    return {
      id: m.id,
      drawingRevisionId: m.drawingRevisionId,
      label: m.label,
      kind: m.kind as PersistedTakeoff["kind"],
      unitOfMeasure: m.unitOfMeasure,
      assembly: m.assembly,
      rawQuantity: qty,
      unitRateMinor: rate,
      currency: m.currency,
      lineCostMinor,
      geometry: (m.geometry as TakeoffGeometryPoint[]) ?? [],
      scaleSnapshot: (m.scaleSnapshot as TakeoffScaleSnapshot | null) ?? null,
      boqItemId: m.boqItemId,
      boqSectionId: m.boqSectionId,
      // The FK is set, but the join found no live BOQ line ⇒ it was deleted.
      boqLineMissing: m.boqItemId != null && boqItemId == null,
      notes: m.notes,
      isStale,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  });
}

/**
 * Count of measurements grouped by revision that are stale (a newer revision
 * of the same drawing exists). Powers a "N takeoffs need re-measuring" banner.
 */
export async function countStaleTakeoffs(orgId: string): Promise<number> {
  const db = requireDb();
  const newerRev = drawingRevisions;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(takeoffMeasurements)
    .innerJoin(
      drawingRevisions,
      eq(drawingRevisions.id, takeoffMeasurements.drawingRevisionId),
    )
    .where(
      and(
        eq(takeoffMeasurements.organizationId, orgId),
        sql`EXISTS (
          SELECT 1 FROM ${newerRev} nr
          WHERE nr.drawing_id = ${drawingRevisions.drawingId}
            AND (nr.revision_date, nr.created_at)
              > (${drawingRevisions.revisionDate}, ${drawingRevisions.createdAt})
        )`,
      ),
    );
  return count ?? 0;
}
