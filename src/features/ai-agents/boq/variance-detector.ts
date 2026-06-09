/**
 * W2-QSBOQ — variance-detector agent (deterministic implementation).
 *
 * Hourly + event-triggered on every boq_actuals write. Reads the
 * planned line (`boq_items`) vs the rolled-up actuals (`boq_actuals`),
 * runs the pure `detectVariances` rules, and files a `variance_reviews`
 * row for every line crossing the 5% threshold that does not already
 * have an OPEN (undecided) review.
 *
 * This replaces the Phase 2.2 stub ({flagged:0,scanned:0}). It performs
 * NO model calls — it is purely a SQL read + rule pass + insert, so it
 * is safe to schedule on a cron and cheap to event-trigger. The
 * cost-anomaly-explainer agent runs separately to draft reason text on
 * the rows this agent files.
 *
 * Idempotent: an already-flagged-and-undecided line is skipped, so
 * re-running (hourly or on each actuals write) never duplicates rows.
 */

import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import {
  detectVariances,
  type VarianceLineInput,
} from "./variance-rules";
import { varianceReviews } from "@/lib/db/schema/variance-reviews";
import { recordAuditEvent } from "@/features/audit/services";

export interface VarianceDetectorInput {
  organizationId: string;
  /** Optional — scope the scan to a single project's BOQ lines. */
  projectId?: string;
}

export interface VarianceDetectorOutput {
  /** Lines that crossed the threshold and got a NEW review row. */
  flagged: number;
  /** Lines scanned (had at least one actuals row rolled up). */
  scanned: number;
}

type PlanActualRow = {
  line_id: string;
  qty_planned: string;
  rate_planned: string;
  qty_actual: string;
  rate_actual: string;
  rate_currency: string;
  has_open_review: boolean;
};

/**
 * Roll boq_actuals per line, join the planned boq_items figures, and
 * flag whether the line already has an open (undecided) review so we
 * don't double-file. `rate_actual` is the qty-weighted average actual
 * rate; `total_actual = qty_actual * rate_actual`.
 *
 * `unit_rate_minor` is BIGINT minor units; we divide to MAJOR units so
 * the figures line up with `computeVariance` (qty × rate as plain
 * numbers). Re-multiplied magnitude is converted back to minor for the
 * stored `magnitude_usd` (kept in line currency).
 */
async function readPlanVsActual(
  db: NonNullable<ReturnType<typeof getDb>>,
  organizationId: string,
  projectId?: string,
): Promise<PlanActualRow[]> {
  const projectFilter = projectId
    ? sql`AND d.project_id = ${projectId}`
    : sql``;
  const rows = await db.execute<PlanActualRow>(sql`
    SELECT
      i.id::text                                            AS line_id,
      i.quantity::text                                      AS qty_planned,
      (i.unit_rate_minor::numeric / 100)::text              AS rate_planned,
      COALESCE(a.qty_actual, 0)::text                       AS qty_actual,
      COALESCE(a.rate_actual, 0)::text                      AS rate_actual,
      i.rate_currency                                       AS rate_currency,
      EXISTS (
        SELECT 1 FROM variance_reviews vr
         WHERE vr.line_id = i.id
           AND vr.qs_decision IS NULL
      )                                                     AS has_open_review
    FROM boq_items i
    JOIN boq_sections s   ON s.id = i.section_id
    JOIN boq_documents d  ON d.id = s.boq_document_id
    LEFT JOIN LATERAL (
      SELECT
        SUM(qty_actual)                                            AS qty_actual,
        CASE WHEN SUM(qty_actual) > 0
             THEN SUM(qty_actual * rate_actual) / SUM(qty_actual)
             ELSE 0 END                                            AS rate_actual
      FROM boq_actuals ba
      WHERE ba.line_id = i.id
    ) a ON true
    WHERE i.organization_id = ${organizationId}
      ${projectFilter}
      AND COALESCE(a.qty_actual, 0) > 0
  `);
  return rowsOf<PlanActualRow>(rows);
}

export async function run(
  input: VarianceDetectorInput,
): Promise<VarianceDetectorOutput> {
  const db = getDb();
  if (!db) return { flagged: 0, scanned: 0 };

  const rows = await readPlanVsActual(db, input.organizationId, input.projectId);
  if (rows.length === 0) return { flagged: 0, scanned: 0 };

  // Keep a side-table of per-line currency + open-review state keyed by
  // line id so we can build the insert payload after the pure pass.
  const meta = new Map<string, { currency: string; hasOpenReview: boolean }>();
  const lines: VarianceLineInput[] = rows.map((r) => {
    meta.set(r.line_id, {
      currency: r.rate_currency ?? "IDR",
      hasOpenReview: r.has_open_review === true,
    });
    return {
      lineId: r.line_id,
      qtyPlanned: Number(r.qty_planned),
      ratePlanned: Number(r.rate_planned),
      qtyActual: Number(r.qty_actual),
      rateActual: Number(r.rate_actual),
    };
  });

  const flags = detectVariances(lines);

  // Only file rows for lines without an existing open review.
  const toInsert = flags.filter((f) => !meta.get(f.lineId)?.hasOpenReview);

  let flagged = 0;
  for (const f of toInsert) {
    // magnitude_usd stores the signed total drift in line currency,
    // MAJOR units (the column is numeric, not a money column).
    const magnitudeMajor = f.magnitudeMajor;
    await db.insert(varianceReviews).values({
      lineId: f.lineId,
      kind: f.kind,
      magnitudePct: f.magnitudePct.toFixed(3),
      magnitudeUsd: magnitudeMajor.toFixed(2),
    });
    flagged += 1;
  }

  if (flagged > 0) {
    await recordAuditEvent({
      actorUserId: null,
      action: "boq.variance.detected",
      entityType: "boq_variance_detector",
      entityId: null,
      before: null,
      after: { flagged, scanned: rows.length, projectId: input.projectId ?? null },
      metadata: { agentCode: VARIANCE_DETECTOR_AGENT.agentCode },
      // Agent runs outside a request context — skip header capture.
      ipAddress: null,
      userAgent: null,
    });
  }

  return { flagged, scanned: rows.length };
}

export const VARIANCE_DETECTOR_AGENT = {
  agentCode: "variance-detector",
  cron: "0 * * * *",
  description:
    "Hourly + on-write scan of BOQ actuals; flags variances >5% into the QS review queue.",
} as const;
