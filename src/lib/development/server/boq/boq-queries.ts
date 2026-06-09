import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, requireDb, rowsOf } from "@/lib/db/client";
import {
  boqDocuments,
  boqSections,
  boqItems,
} from "@/lib/db/schema/boq";

/**
 * Flat list of BOQ sections across all documents in the org, for a
 * "save a takeoff line into this section" picker. The label combines the
 * document title + section name.
 */
export async function listBoqSectionTargets(): Promise<
  Array<{ sectionId: string; label: string }>
> {
  const db = requireDb();
  const rows = await db
    .select({
      sectionId: boqSections.id,
      sectionName: boqSections.sectionName,
      docTitle: boqDocuments.title,
    })
    .from(boqSections)
    .innerJoin(boqDocuments, eq(boqDocuments.id, boqSections.boqDocumentId))
    .orderBy(asc(boqDocuments.title), asc(boqSections.displayOrder));
  return rows.map((r) => ({
    sectionId: r.sectionId,
    label: `${r.docTitle} · ${r.sectionName}`,
  }));
}

export async function listBoqDocuments(filters?: {
  projectId?: string;
  villaId?: string;
  status?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(boqDocuments.projectId, filters.projectId));
  }
  if (filters?.villaId) {
    conditions.push(eq(boqDocuments.villaId, filters.villaId));
  }
  if (filters?.status) {
    conditions.push(eq(boqDocuments.status, filters.status));
  }
  return db
    .select()
    .from(boqDocuments)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(boqDocuments.createdAt));
}

export async function getBoqDocumentByCode(code: string) {
  const db = requireDb();
  const [doc] = await db
    .select()
    .from(boqDocuments)
    .where(eq(boqDocuments.boqCode, code))
    .limit(1);
  if (!doc) return null;
  const sections = await db
    .select()
    .from(boqSections)
    .where(eq(boqSections.boqDocumentId, doc.id))
    .orderBy(asc(boqSections.displayOrder), asc(boqSections.sectionCode));
  const sectionIds = sections.map((s) => s.id);
  const items =
    sectionIds.length === 0
      ? []
      : await db
          .select()
          .from(boqItems)
          .where(
            sql`${boqItems.sectionId} = ANY(${sectionIds}::uuid[])`,
          )
          .orderBy(asc(boqItems.itemCode));
  return { document: doc, sections, items };
}

/**
 * Rolled-up posted actuals keyed by BOQ line id, for the lines of one
 * document. Read-only fill for the estimate-vs-actual workbench
 * (dev-p1/boq-qs.html): joins the existing `boq_actuals` table the same
 * way the QS variance card does, returning the qty-weighted average
 * actual rate + the summed actual cost (minor units) per line. Lines
 * with no posted actual are simply absent from the map.
 *
 * Best-effort: returns an empty map when the DB is unavailable so the
 * detail page degrades to a plan-only view rather than throwing.
 */
export type BoqLineActual = {
  qtyActual: number;
  /** Summed posted actual cost in MINOR units. */
  actualCostMinor: number;
};

type BoqLineActualRow = {
  line_id: string;
  qty_actual: string;
  actual_cost_minor: string;
};

export async function getBoqActualsByLine(
  boqDocumentId: string,
): Promise<Map<string, BoqLineActual>> {
  const db = getDb();
  if (!db) return new Map();
  const rows = await db.execute<BoqLineActualRow>(sql`
    SELECT
      i.id::text                                   AS line_id,
      COALESCE(SUM(ba.qty_actual), 0)::text        AS qty_actual,
      COALESCE(SUM(ba.qty_actual * ba.rate_actual) * 100, 0)::text
                                                   AS actual_cost_minor
    FROM boq_items i
    JOIN boq_sections s ON s.id = i.section_id
    JOIN boq_actuals ba ON ba.line_id = i.id
    WHERE s.boq_document_id = ${boqDocumentId}
    GROUP BY i.id
    HAVING SUM(ba.qty_actual) > 0
  `);
  const map = new Map<string, BoqLineActual>();
  for (const r of rowsOf<BoqLineActualRow>(rows)) {
    map.set(r.line_id, {
      qtyActual: Number(r.qty_actual),
      actualCostMinor: Math.round(Number(r.actual_cost_minor)),
    });
  }
  return map;
}
