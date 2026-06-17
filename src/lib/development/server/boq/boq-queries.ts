import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, requireDb, rowsOf } from "@/lib/db/client";
import {
  boqDocuments,
  boqSections,
  boqItems,
} from "@/lib/db/schema/boq";
import { boqActuals } from "@/lib/db/schema/boq-actuals";
import { purchaseOrders } from "@/lib/db/schema/inventory";
import { requireOrgId } from "@/features/auth/require-org";

/** A BOQ document is considered "published" once it has left draft. */
const PUBLISHED_BOQ_STATUSES = [
  "approved",
  "tender",
  "awarded",
] as const;

/**
 * Flat list of BOQ sections across all documents in the org, for a
 * "save a takeoff line into this section" picker. The label combines the
 * document title + section name.
 */
export async function listBoqSectionTargets(): Promise<
  Array<{ sectionId: string; label: string }>
> {
  const db = requireDb();
  const orgId = await requireOrgId();
  const rows = await db
    .select({
      sectionId: boqSections.id,
      sectionName: boqSections.sectionName,
      docTitle: boqDocuments.title,
    })
    .from(boqSections)
    .innerJoin(boqDocuments, eq(boqDocuments.id, boqSections.boqDocumentId))
    .where(
      and(
        eq(boqDocuments.organizationId, orgId),
        eq(boqSections.organizationId, orgId),
      ),
    )
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
  const orgId = await requireOrgId();
  const conditions: Array<ReturnType<typeof eq>> = [
    eq(boqDocuments.organizationId, orgId),
  ];
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
    .where(and(...conditions))
    .orderBy(desc(boqDocuments.createdAt));
}

export async function getBoqDocumentByCode(code: string) {
  const db = requireDb();
  const orgId = await requireOrgId();
  const [doc] = await db
    .select()
    .from(boqDocuments)
    .where(
      and(
        eq(boqDocuments.boqCode, code),
        eq(boqDocuments.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!doc) return null;
  const sections = await db
    .select()
    .from(boqSections)
    .where(
      and(
        eq(boqSections.boqDocumentId, doc.id),
        eq(boqSections.organizationId, orgId),
      ),
    )
    .orderBy(asc(boqSections.displayOrder), asc(boqSections.sectionCode));
  const sectionIds = sections.map((s) => s.id);
  const items =
    sectionIds.length === 0
      ? []
      : await db
          .select()
          .from(boqItems)
          .where(
            and(
              inArray(boqItems.sectionId, sectionIds),
              eq(boqItems.organizationId, orgId),
            ),
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
  const orgId = await requireOrgId();
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
      AND s.organization_id = ${orgId}
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

// =========================================================================
// Project BOQ workspace reads (project [slug]/boq pages)
// =========================================================================

export type PublishedBoqLine = {
  id: string;
  code: string;
  description: string;
  /** Section name doubles as the WP grouping in the workspace tree. */
  sectionCode: string;
  sectionName: string;
  unit: string;
  qtyPlanned: number;
  /** Planned rate in MAJOR units (unit_rate_minor / 100). */
  ratePlanned: number;
  qtyActual: number;
  /** Qty-weighted average actual rate in MAJOR units. */
  rateActual: number;
};

export type PublishedBoqWorkspace = {
  document: {
    id: string;
    boqCode: string;
    title: string;
    versionLabel: string;
    status: string;
    currency: string;
  };
  sections: Array<{ code: string; name: string; lineCount: number }>;
  lines: PublishedBoqLine[];
};

/**
 * The latest published BOQ revision for a project + its lines, joined to the
 * rolled-up posted actuals. "Published" = the highest version_number document
 * whose status has left draft. Returns null when no revision is published
 * (the page renders an honest empty state).
 *
 * Org-scoped on every table touched.
 */
export async function getPublishedBoqForProject(
  projectId: string,
): Promise<PublishedBoqWorkspace | null> {
  const db = requireDb();
  const orgId = await requireOrgId();

  const [doc] = await db
    .select()
    .from(boqDocuments)
    .where(
      and(
        eq(boqDocuments.organizationId, orgId),
        eq(boqDocuments.projectId, projectId),
        inArray(boqDocuments.status, [...PUBLISHED_BOQ_STATUSES]),
      ),
    )
    .orderBy(desc(boqDocuments.versionNumber), desc(boqDocuments.createdAt))
    .limit(1);
  if (!doc) return null;

  const sections = await db
    .select()
    .from(boqSections)
    .where(
      and(
        eq(boqSections.boqDocumentId, doc.id),
        eq(boqSections.organizationId, orgId),
      ),
    )
    .orderBy(asc(boqSections.displayOrder), asc(boqSections.sectionCode));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const sectionIds = sections.map((s) => s.id);

  const items =
    sectionIds.length === 0
      ? []
      : await db
          .select()
          .from(boqItems)
          .where(
            and(
              inArray(boqItems.sectionId, sectionIds),
              eq(boqItems.organizationId, orgId),
            ),
          )
          .orderBy(asc(boqItems.itemCode));

  const actuals = await getBoqActualsByLine(doc.id);

  const lines: PublishedBoqLine[] = items.map((it) => {
    const section = sectionById.get(it.sectionId);
    const qtyPlanned = Number(it.quantity);
    const actual = actuals.get(it.id);
    const qtyActual = actual?.qtyActual ?? 0;
    // Derive the qty-weighted average actual rate (MAJOR units) from the
    // summed actual cost (MINOR) so the variance pill reflects real spend.
    const rateActual =
      qtyActual > 0 && actual
        ? actual.actualCostMinor / 100 / qtyActual
        : 0;
    return {
      id: it.id,
      code: it.itemCode,
      description: it.description,
      sectionCode: section?.sectionCode ?? "—",
      sectionName: section?.sectionName ?? "Ungrouped",
      unit: it.unitOfMeasure,
      qtyPlanned,
      ratePlanned: Number(it.unitRateMinor) / 100,
      qtyActual,
      rateActual,
    };
  });

  const lineCountByCode = new Map<string, number>();
  for (const l of lines) {
    lineCountByCode.set(
      l.sectionCode,
      (lineCountByCode.get(l.sectionCode) ?? 0) + 1,
    );
  }

  return {
    document: {
      id: doc.id,
      boqCode: doc.boqCode,
      title: doc.title,
      versionLabel: doc.versionLabel,
      status: doc.status,
      currency: doc.currency,
    },
    sections: sections.map((s) => ({
      code: s.sectionCode,
      name: s.sectionName,
      lineCount: lineCountByCode.get(s.sectionCode) ?? 0,
    })),
    lines,
  };
}

export type BoqLineActualRecord = {
  id: string;
  recordedAt: string;
  qtyActual: number;
  rateActual: number;
  note: string | null;
  poCode: string | null;
};

export type BoqLineDetail = {
  line: {
    id: string;
    code: string;
    description: string;
    unit: string;
    qtyPlanned: number;
    /** Planned rate in MAJOR units. */
    ratePlanned: number;
  };
  document: { boqCode: string; title: string; projectId: string };
  actuals: BoqLineActualRecord[];
};

/**
 * One BOQ line (by id) with its full posted-actuals event log, scoped to the
 * caller's org. Returns null for an unknown / cross-org line so the page
 * notFound()s. The line is verified to belong to the given project.
 */
export async function getBoqLineDetail(
  projectId: string,
  lineId: string,
): Promise<BoqLineDetail | null> {
  const db = requireDb();
  const orgId = await requireOrgId();

  const [row] = await db
    .select({
      id: boqItems.id,
      itemCode: boqItems.itemCode,
      description: boqItems.description,
      unit: boqItems.unitOfMeasure,
      quantity: boqItems.quantity,
      unitRateMinor: boqItems.unitRateMinor,
      boqCode: boqDocuments.boqCode,
      title: boqDocuments.title,
      projectId: boqDocuments.projectId,
    })
    .from(boqItems)
    .innerJoin(boqSections, eq(boqSections.id, boqItems.sectionId))
    .innerJoin(boqDocuments, eq(boqDocuments.id, boqSections.boqDocumentId))
    .where(
      and(
        eq(boqItems.id, lineId),
        eq(boqItems.organizationId, orgId),
        eq(boqDocuments.projectId, projectId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const actualRows = await db
    .select({
      id: boqActuals.id,
      recordedAt: boqActuals.recordedAt,
      qtyActual: boqActuals.qtyActual,
      rateActual: boqActuals.rateActual,
      note: boqActuals.note,
      poCode: purchaseOrders.poCode,
    })
    .from(boqActuals)
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, boqActuals.sourcePoId))
    .where(
      and(
        eq(boqActuals.lineId, lineId),
        eq(boqActuals.organizationId, orgId),
      ),
    )
    .orderBy(asc(boqActuals.recordedAt));

  return {
    line: {
      id: row.id,
      code: row.itemCode,
      description: row.description,
      unit: row.unit,
      qtyPlanned: Number(row.quantity),
      ratePlanned: Number(row.unitRateMinor) / 100,
    },
    document: {
      boqCode: row.boqCode,
      title: row.title,
      projectId: row.projectId,
    },
    actuals: actualRows.map((a) => ({
      id: a.id,
      recordedAt:
        a.recordedAt instanceof Date
          ? a.recordedAt.toISOString().slice(0, 10)
          : String(a.recordedAt).slice(0, 10),
      qtyActual: Number(a.qtyActual),
      rateActual: Number(a.rateActual),
      note: a.note,
      poCode: a.poCode ?? null,
    })),
  };
}
