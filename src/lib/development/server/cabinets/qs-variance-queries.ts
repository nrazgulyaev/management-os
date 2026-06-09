import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * W2-QSBOQ — QS cabinet variance + agent-output readers.
 *
 * Self-contained reads for the QS cabinet page (the VarianceCard band
 * + the qs-cost-analyst agent_outputs band). Kept in a NEW module
 * rather than extending qs-cabinet-queries.ts so this unit owns its
 * surface area. All reads are org-scoped via requireOrgId() (TENANT-1).
 *
 * Money columns are BIGINT minor; this module returns MAJOR-unit
 * numbers (÷100) because the VarianceCard renders qty × rate as plain
 * numbers and runs them through computeVariance.
 */

export interface QsVarianceLine {
  lineId: string;
  /** "<section>.<item>" reference shown in the card. */
  code: string;
  description: string;
  /** Work-package / section code. */
  wpCode: string;
  unit: string;
  qtyPlanned: number;
  ratePlanned: number;
  qtyActual: number;
  rateActual: number;
  currency: string;
  /** Latest contractor reason captured on an open review, if any. */
  contractorReason: string | null;
}

type VarianceLineRow = {
  line_id: string;
  item_code: string;
  section_code: string;
  description: string;
  unit_of_measure: string;
  qty_planned: string;
  rate_planned: string;
  qty_actual: string;
  rate_actual: string;
  rate_currency: string;
  contractor_reason: string | null;
};

/**
 * Plan-vs-actual per BOQ line for this org, restricted to lines that
 * have at least one rolled-up actual (so the QS card always shows a
 * real delta). Ordered by absolute total drift DESC so the worst
 * offenders surface first. `rate_actual` is the qty-weighted average
 * actual unit rate.
 */
export async function getQsVarianceLines(limit = 12): Promise<QsVarianceLine[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<VarianceLineRow>(sql`
    SELECT
      i.id::text                                            AS line_id,
      i.item_code                                           AS item_code,
      s.section_code                                        AS section_code,
      i.description                                         AS description,
      i.unit_of_measure                                     AS unit_of_measure,
      i.quantity::text                                      AS qty_planned,
      (i.unit_rate_minor::numeric / 100)::text              AS rate_planned,
      COALESCE(a.qty_actual, 0)::text                       AS qty_actual,
      COALESCE(a.rate_actual, 0)::text                      AS rate_actual,
      i.rate_currency                                       AS rate_currency,
      (
        SELECT vr.contractor_reason
          FROM variance_reviews vr
         WHERE vr.line_id = i.id
           AND vr.contractor_reason IS NOT NULL
         ORDER BY vr.flagged_at DESC
         LIMIT 1
      )                                                     AS contractor_reason
    FROM boq_items i
    JOIN boq_sections s   ON s.id = i.section_id
    JOIN boq_documents d  ON d.id = s.boq_document_id
    LEFT JOIN LATERAL (
      SELECT
        SUM(ba.qty_actual)                                         AS qty_actual,
        CASE WHEN SUM(ba.qty_actual) > 0
             THEN SUM(ba.qty_actual * ba.rate_actual) / SUM(ba.qty_actual)
             ELSE 0 END                                            AS rate_actual
      FROM boq_actuals ba
      WHERE ba.line_id = i.id
    ) a ON true
    WHERE i.organization_id = ${orgId}
      AND COALESCE(a.qty_actual, 0) > 0
    ORDER BY ABS(
      (COALESCE(a.qty_actual, 0) * COALESCE(a.rate_actual, 0))
      - (i.quantity * (i.unit_rate_minor::numeric / 100))
    ) DESC
    LIMIT ${limit}
  `);
  return rowsOf<VarianceLineRow>(rows).map((r) => ({
    lineId: r.line_id,
    code: `${r.section_code}.${r.item_code}`,
    description: r.description,
    wpCode: r.section_code,
    unit: r.unit_of_measure,
    qtyPlanned: Number(r.qty_planned),
    ratePlanned: Number(r.rate_planned),
    qtyActual: Number(r.qty_actual),
    rateActual: Number(r.rate_actual),
    currency: r.rate_currency ?? "IDR",
    contractorReason: r.contractor_reason,
  }));
}

export interface QsAnalystOutput {
  outputCode: string;
  title: string;
  summary: string;
  status: string;
  confidenceLevel: string | null;
  createdAt: string;
}

type QsAnalystOutputRow = {
  output_code: string;
  title: string;
  summary: string;
  status: string;
  confidence_level: string | null;
  created_at: string;
};

/**
 * Recent qs_cost_analyst agent_outputs for the QS cabinet AI band.
 * Mirrors the agent_outputs query pattern used by the marketing
 * cabinet (agent_key = 'qs_cost_analyst'). Returns [] when none seeded
 * so the page renders its empty-state band.
 */
export async function getQsCostAnalystOutputs(limit = 3): Promise<QsAnalystOutput[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<QsAnalystOutputRow>(sql`
    SELECT output_code,
           title,
           summary,
           status,
           confidence_level,
           created_at::text AS created_at
      FROM agent_outputs
     WHERE agent_key = 'qs_cost_analyst'
     ORDER BY created_at DESC
     LIMIT ${limit}
  `);
  return rowsOf<QsAnalystOutputRow>(rows).map((r) => ({
    outputCode: r.output_code,
    title: r.title,
    summary: r.summary,
    status: r.status,
    confidenceLevel: r.confidence_level,
    createdAt: r.created_at,
  }));
}
