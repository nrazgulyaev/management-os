import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

export interface QsCabinetData {
  activeBoqCount: number;
  recentBoqs: Array<{ id: string; title: string; status: string }>;
  latestQsAnalystOutputCode: string | null;
  awaitingQsAnalysisCount: number;
  recentSpecificationsCount: number;
  /** Phase 4 — BoQ documents in 'under_review' (proxy for "lines awaiting QS review"). */
  boqsUnderReviewCount: number;
  /** Phase 4 — change_orders with status in (requested, under_review). */
  openChangeOrdersCount: number;
  /** Phase 4 — qs-cost-analyst outputs created in the last 7 days. */
  anomaliesThisWeekCount: number;
  /** Phase 4 — daily anomaly counts for the HatchedBarChart (last 7 days). */
  anomaliesLast7Days: Array<{ isoDate: string; count: number }>;
  /** Phase 4 — top 3 recent qs-cost-analyst outputs for the inline AI grid. */
  recentQsAnalystOutputs: Array<{
    outputCode: string;
    title: string;
    summary: string;
    createdAt: string;
  }>;
}

export async function loadQsCabinet(): Promise<QsCabinetData> {
  const db = getDb();
  if (!db) {
    return {
      activeBoqCount: 0,
      recentBoqs: [],
      latestQsAnalystOutputCode: null,
      awaitingQsAnalysisCount: 0,
      recentSpecificationsCount: 0,
      boqsUnderReviewCount: 0,
      openChangeOrdersCount: 0,
      anomaliesThisWeekCount: 0,
      anomaliesLast7Days: [],
      recentQsAnalystOutputs: [],
    };
  }
  const summary = await db.execute<{
    active_boqs: string;
    awaiting_qs: string;
    spec_recent: string;
    boqs_under_review: string;
    open_cos: string;
    anomalies_week: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM boq_documents
        WHERE status NOT IN ('archived')) AS active_boqs,
      (SELECT COUNT(*)::text FROM agent_outputs
        WHERE agent_key = 'qs_cost_analyst' AND status = 'awaiting_review') AS awaiting_qs,
      (SELECT COUNT(*)::text FROM specifications
        WHERE created_at >= now() - INTERVAL '30 days') AS spec_recent,
      (SELECT COUNT(*)::text FROM boq_documents
        WHERE status = 'under_review') AS boqs_under_review,
      (SELECT COUNT(*)::text FROM change_orders
        WHERE status IN ('requested', 'under_review')) AS open_cos,
      (SELECT COUNT(*)::text FROM agent_outputs
        WHERE agent_key = 'qs_cost_analyst'
          AND created_at >= now() - INTERVAL '7 days') AS anomalies_week
  `);
  const s =
    rowsOf<{
        active_boqs: string;
        awaiting_qs: string;
        spec_recent: string;
        boqs_under_review: string;
        open_cos: string;
        anomalies_week: string;
      }>(summary)[0] ?? null;

  const recentBoqs = await db.execute<{ id: string; title: string; status: string }>(sql`
    SELECT id::text, title, status FROM boq_documents
     ORDER BY created_at DESC LIMIT 8
  `);
  const latestQs = await db.execute<{ output_code: string }>(sql`
    SELECT output_code FROM agent_outputs
     WHERE agent_key = 'qs_cost_analyst'
     ORDER BY created_at DESC LIMIT 1
  `);

  const dailyAnomalies = await db.execute<{
    iso_date: string;
    count: string;
  }>(sql`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS iso_date,
           COUNT(*)::text AS count
      FROM agent_outputs
     WHERE agent_key = 'qs_cost_analyst'
       AND created_at >= (now() - INTERVAL '7 days')
     GROUP BY 1
     ORDER BY 1 ASC
  `);

  const recentOutputs = await db.execute<{
    output_code: string;
    title: string;
    summary: string;
    created_at: string;
  }>(sql`
    SELECT output_code, title, summary, created_at::text
      FROM agent_outputs
     WHERE agent_key = 'qs_cost_analyst'
     ORDER BY created_at DESC LIMIT 3
  `);

  return {
    activeBoqCount: Number(s?.active_boqs ?? "0"),
    awaitingQsAnalysisCount: Number(s?.awaiting_qs ?? "0"),
    recentSpecificationsCount: Number(s?.spec_recent ?? "0"),
    boqsUnderReviewCount: Number(s?.boqs_under_review ?? "0"),
    openChangeOrdersCount: Number(s?.open_cos ?? "0"),
    anomaliesThisWeekCount: Number(s?.anomalies_week ?? "0"),
    recentBoqs:
      rowsOf<{ id: string; title: string; status: string }>(recentBoqs),
    latestQsAnalystOutputCode:
      rowsOf<{ output_code: string }>(latestQs)[0]
        ?.output_code ?? null,
    anomaliesLast7Days:
      rowsOf<{ iso_date: string; count: string }>(dailyAnomalies).map((r) => ({
        isoDate: r.iso_date,
        count: Number(r.count ?? "0"),
      })) ?? [],
    recentQsAnalystOutputs:
      rowsOf<{
          output_code: string;
          title: string;
          summary: string;
          created_at: string;
        }>(recentOutputs).map((r) => ({
        outputCode: r.output_code,
        title: r.title,
        summary: r.summary,
        createdAt: r.created_at,
      })) ?? [],
  };
}

// =============================================================================
// Sprint TASK-7-DATA-PART-2 — QS BOQ Desk view readers.
//
// The _handoff/ QS cabinet needs three list/rollup reads against the
// BOQ schema. Existing `loadQsCabinet()` returns summary counts only.
// All queries org-scoped via requireOrgId() (TENANT-1).
// =============================================================================

export interface WpRollupRow {
  /** Work-package title from boq_sections (top-level section). */
  wpTitle: string;
  /** Section code (e.g. "WP-04"). */
  wpCode: string;
  /** Sum of section subtotal_minor (IDR minor). */
  budgetMinor: number;
  /** Sum of computed boq_items.total_minor across items in this WP. */
  baselineMinor: number;
  /** Count of items in this WP. */
  itemCount: number;
  currency: string;
}

/** Rollup totals per top-level WP (boq_sections without parent). */
export async function getBoqWpRollup(): Promise<WpRollupRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    wp_code: string;
    wp_title: string;
    budget: string;
    baseline: string;
    item_count: string;
    currency: string;
  }>(sql`
    SELECT s.section_code                                      AS wp_code,
           s.section_name                                       AS wp_title,
           COALESCE(s.subtotal_minor, 0)::text                  AS budget,
           COALESCE(SUM(i.total_minor), 0)::text                AS baseline,
           COUNT(i.id)::text                                    AS item_count,
           COALESCE(MAX(i.rate_currency), MAX(d.currency))      AS currency
      FROM boq_sections s
      JOIN boq_documents d ON d.id = s.boq_document_id
      LEFT JOIN boq_items i ON i.section_id = s.id
                            AND i.organization_id = ${orgId}
     WHERE s.organization_id = ${orgId}
       AND s.parent_section_id IS NULL
       AND d.status IN ('draft','under_review','approved','tender','awarded')
     GROUP BY s.id, s.section_code, s.section_name, s.subtotal_minor
     ORDER BY s.section_code
     LIMIT 6
  `);
  return (
    rowsOf<{
      wp_code: string;
      wp_title: string;
      budget: string;
      baseline: string;
      item_count: string;
      currency: string;
    }>(rows)
  ).map((r) => ({
    wpCode: r.wp_code,
    wpTitle: r.wp_title,
    budgetMinor: Number(r.budget),
    baselineMinor: Number(r.baseline),
    itemCount: Number(r.item_count),
    currency: r.currency ?? "IDR",
  }));
}

export interface BoqLineRow {
  /** boq_items.id — needed for inline delete on the QS desk. */
  lineId: string;
  itemCode: string;
  sectionCode: string;
  description: string;
  quantity: number;
  unitOfMeasure: string;
  unitRateMinor: number;
  totalMinor: number;
  currency: string;
}

/** Top-N highest-total BOQ items across all docs for this org. */
export async function getBoqTopLines(limit = 7): Promise<BoqLineRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    line_id: string;
    item_code: string;
    section_code: string;
    description: string;
    quantity: string;
    unit_of_measure: string;
    unit_rate_minor: string;
    total_minor: string;
    currency: string;
  }>(sql`
    SELECT i.id::text                          AS line_id,
           i.item_code,
           s.section_code,
           i.description,
           i.quantity::text,
           i.unit_of_measure,
           i.unit_rate_minor::text,
           COALESCE(i.total_minor, 0)::text AS total_minor,
           i.rate_currency                   AS currency
      FROM boq_items i
      JOIN boq_sections s ON s.id = i.section_id
     WHERE i.organization_id = ${orgId}
     ORDER BY i.total_minor DESC NULLS LAST
     LIMIT ${limit}
  `);
  return (
    rowsOf<{
      line_id: string;
      item_code: string;
      section_code: string;
      description: string;
      quantity: string;
      unit_of_measure: string;
      unit_rate_minor: string;
      total_minor: string;
      currency: string;
    }>(rows)
  ).map((r) => ({
    lineId: r.line_id,
    itemCode: r.item_code,
    sectionCode: r.section_code,
    description: r.description,
    quantity: Number(r.quantity),
    unitOfMeasure: r.unit_of_measure,
    unitRateMinor: Number(r.unit_rate_minor),
    totalMinor: Number(r.total_minor),
    currency: r.currency ?? "IDR",
  }));
}

export interface RfqMatrixRow {
  quotationId: string;
  vendorName: string | null;
  prCode: string | null;
  materialName: string | null;
  totalAmountMinor: number;
  currency: string;
  deliveryEta: string | null;
  status: string;
}

/** Active RFQs / quotations. May be empty when DEMO-1 hasn't seeded
 *  procurement_quotations rows. */
export async function getRfqMatrix(): Promise<RfqMatrixRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    vendor_name: string | null;
    pr_code: string | null;
    material_name: string | null;
    total_amount_minor: string;
    currency: string;
    delivery_eta: string | null;
    status: string;
  }>(sql`
    SELECT q.id::text                                             AS id,
           v.legal_name                                            AS vendor_name,
           pr.request_code                                         AS pr_code,
           pr.material_name                                        AS material_name,
           q.total_amount_minor::text                              AS total_amount_minor,
           q.currency                                              AS currency,
           q.delivery_estimated_date::text                         AS delivery_eta,
           q.status                                                AS status
      FROM procurement_quotations q
      LEFT JOIN vendors v               ON v.id = q.vendor_id
      LEFT JOIN dev_os_purchase_requests pr ON pr.id = q.purchase_request_id
     WHERE q.organization_id = ${orgId}
       AND q.status IN ('received','under_review','selected')
     ORDER BY pr.request_code, q.total_amount_minor ASC NULLS LAST
     LIMIT 12
  `);
  return (
    rowsOf<{
      id: string;
      vendor_name: string | null;
      pr_code: string | null;
      material_name: string | null;
      total_amount_minor: string;
      currency: string;
      delivery_eta: string | null;
      status: string;
    }>(rows)
  ).map((r) => ({
    quotationId: r.id,
    vendorName: r.vendor_name,
    prCode: r.pr_code,
    materialName: r.material_name,
    totalAmountMinor: Number(r.total_amount_minor),
    currency: r.currency,
    deliveryEta: r.delivery_eta,
    status: r.status,
  }));
}

// =============================================================================
// P1 — QS BOQ-desk CRUD support readers (inline add + Compare REV).
//
// `listQsBoqRevisions()` feeds both the inline "New estimate line" section
// picker AND the "Compare REV" two-revision selector. `diffBoqRevisions()`
// powers the Compare REV diff. All org-scoped via requireOrgId() (TENANT-1).
// =============================================================================

export interface QsBoqRevision {
  documentId: string;
  boqCode: string;
  title: string;
  versionLabel: string;
  status: string;
  currency: string;
  projectId: string;
  /** Section codes inside this document (for the inline-add picker). */
  sectionCodes: string[];
}

/** Active (non-archived) BOQ documents for this org, newest first, with
 *  their section codes inlined. A "revision" in the QS desk == one
 *  boq_documents row (version_label distinguishes v1.0 / v1.1 / …). */
export async function listQsBoqRevisions(): Promise<QsBoqRevision[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    document_id: string;
    boq_code: string;
    title: string;
    version_label: string;
    status: string;
    currency: string;
    project_id: string;
    section_codes: string[] | null;
  }>(sql`
    SELECT d.id::text                                            AS document_id,
           d.boq_code                                            AS boq_code,
           d.title                                               AS title,
           d.version_label                                       AS version_label,
           d.status                                              AS status,
           d.currency                                            AS currency,
           d.project_id::text                                    AS project_id,
           COALESCE(
             ARRAY_AGG(s.section_code ORDER BY s.display_order, s.section_code)
               FILTER (WHERE s.section_code IS NOT NULL),
             '{}'
           )                                                     AS section_codes
      FROM boq_documents d
      LEFT JOIN boq_sections s ON s.boq_document_id = d.id
                               AND s.organization_id = ${orgId}
     WHERE d.organization_id = ${orgId}
       AND d.status NOT IN ('archived')
     GROUP BY d.id, d.boq_code, d.title, d.version_label, d.status,
              d.currency, d.project_id
     ORDER BY d.created_at DESC
     LIMIT 50
  `);
  return rowsOf<{
    document_id: string;
    boq_code: string;
    title: string;
    version_label: string;
    status: string;
    currency: string;
    project_id: string;
    section_codes: string[] | null;
  }>(rows).map((r) => ({
    documentId: r.document_id,
    boqCode: r.boq_code,
    title: r.title,
    versionLabel: r.version_label,
    status: r.status,
    currency: r.currency,
    projectId: r.project_id,
    sectionCodes: Array.isArray(r.section_codes) ? r.section_codes : [],
  }));
}

export interface BoqRevisionDiffRow {
  /** "section_code.item_code" key shared across both revisions. */
  lineKey: string;
  description: string;
  status: "added" | "removed" | "changed" | "unchanged";
  /** Totals in minor units; null when the line is absent on that side. */
  totalMinorA: number | null;
  totalMinorB: number | null;
  deltaMinor: number;
  currency: string;
}

export interface BoqRevisionDiff {
  rows: BoqRevisionDiffRow[];
  addedCount: number;
  removedCount: number;
  changedCount: number;
  totalMinorA: number;
  totalMinorB: number;
  deltaMinor: number;
  currency: string;
}

/** Diff two BOQ revisions (documents) line-by-line, keyed on
 *  section_code.item_code. Both must belong to the caller's org. */
export async function diffBoqRevisions(
  docAId: string,
  docBId: string,
): Promise<BoqRevisionDiff> {
  const db = getDb();
  if (!db) {
    return {
      rows: [],
      addedCount: 0,
      removedCount: 0,
      changedCount: 0,
      totalMinorA: 0,
      totalMinorB: 0,
      deltaMinor: 0,
      currency: "IDR",
    };
  }
  const orgId = await requireOrgId();
  const sideRows = await db.execute<{
    side: string;
    line_key: string;
    description: string;
    total_minor: string;
    currency: string;
  }>(sql`
    SELECT side, line_key, description, total_minor, currency
      FROM (
        SELECT 'A'::text AS side,
               s.section_code || '.' || i.item_code AS line_key,
               i.description                         AS description,
               COALESCE(i.total_minor, 0)::text      AS total_minor,
               i.rate_currency                       AS currency
          FROM boq_items i
          JOIN boq_sections s ON s.id = i.section_id
         WHERE i.organization_id = ${orgId}
           AND s.boq_document_id = ${docAId}::uuid
        UNION ALL
        SELECT 'B'::text AS side,
               s.section_code || '.' || i.item_code AS line_key,
               i.description                         AS description,
               COALESCE(i.total_minor, 0)::text      AS total_minor,
               i.rate_currency                       AS currency
          FROM boq_items i
          JOIN boq_sections s ON s.id = i.section_id
         WHERE i.organization_id = ${orgId}
           AND s.boq_document_id = ${docBId}::uuid
      ) u
     ORDER BY line_key
  `);
  const parsed = rowsOf<{
    side: string;
    line_key: string;
    description: string;
    total_minor: string;
    currency: string;
  }>(sideRows);

  const byKey = new Map<
    string,
    { description: string; a: number | null; b: number | null; currency: string }
  >();
  for (const r of parsed) {
    const entry =
      byKey.get(r.line_key) ?? {
        description: r.description,
        a: null,
        b: null,
        currency: r.currency ?? "IDR",
      };
    if (r.side === "A") entry.a = Number(r.total_minor);
    else entry.b = Number(r.total_minor);
    if (r.description) entry.description = r.description;
    byKey.set(r.line_key, entry);
  }

  const rowsOut: BoqRevisionDiffRow[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;
  let totalMinorA = 0;
  let totalMinorB = 0;
  let currency = "IDR";

  for (const [lineKey, v] of [...byKey.entries()].sort((x, y) =>
    x[0].localeCompare(y[0]),
  )) {
    currency = v.currency;
    const a = v.a;
    const b = v.b;
    if (a != null) totalMinorA += a;
    if (b != null) totalMinorB += b;
    let status: BoqRevisionDiffRow["status"];
    if (a == null && b != null) {
      status = "added";
      addedCount++;
    } else if (a != null && b == null) {
      status = "removed";
      removedCount++;
    } else if (a != null && b != null && a !== b) {
      status = "changed";
      changedCount++;
    } else {
      status = "unchanged";
    }
    rowsOut.push({
      lineKey,
      description: v.description,
      status,
      totalMinorA: a,
      totalMinorB: b,
      deltaMinor: (b ?? 0) - (a ?? 0),
      currency: v.currency,
    });
  }

  return {
    rows: rowsOut,
    addedCount,
    removedCount,
    changedCount,
    totalMinorA,
    totalMinorB,
    deltaMinor: totalMinorB - totalMinorA,
    currency,
  };
}
