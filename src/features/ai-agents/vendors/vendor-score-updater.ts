/**
 * W2 — vendor-score-updater agent.
 *
 * Nightly cron. Rolls up the trailing 90 days of PO + delivery + RFQ
 * data per active vendor, derives the four component sub-scores with the
 * pure `scoreVendorFromHistory` pipeline, and INSERTs one new row per
 * vendor into `vendor_scores` (history pattern — never UPDATE, so the
 * trailing sparkline keeps its audit trail when the algorithm changes).
 *
 * Deterministic: given the same DB state it always produces the same
 * scores. The scoring math itself lives in the side-effect-free
 * `vendor-score-from-history` module so it is unit-testable without a DB.
 *
 * Compute-on-read fallback: the vendors surface derives the same score
 * live (see vendor-scorecard-queries.ts co-located with the page) so the
 * scorecard renders even if this nightly job has never run.
 */

import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { vendorScores } from "@/lib/db/schema/vendor-scores";
import {
  scoreCohort,
  type VendorHistoryAggregate,
} from "./vendor-score-from-history";
import type { VendorScoreComponents } from "@/features/vendors/scoring";
import type { VendorScoreBand } from "@/features/vendors/scoring";

export interface VendorScoreUpdaterInput {
  organizationId: string;
}

export interface VendorScoreUpdaterOutput {
  updated: number;
  /** Vendors that crossed a band threshold tonight (for the digest). */
  bandChanges: { vendorId: string; from: string; to: string }[];
}

const SCORE_WINDOW = "trailing_90d" as const;

/** Raw row shape returned by the per-vendor aggregate query. */
type AggregateRow = {
  vendor_id: string;
  delivered_lines: string | null;
  on_time_lines: string | null;
  qa_passed_lines: string | null;
  qa_checked_lines: string | null;
  accepted_deliveries: string | null;
  total_deliveries: string | null;
  avg_unit_price_usd_minor: string | null;
  quotations_returned: string | null;
  avg_quote_turnaround_days: string | null;
};

function toInt(v: string | null): number {
  if (v === null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toNullableNum(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToAggregate(r: AggregateRow): VendorHistoryAggregate {
  return {
    vendorId: r.vendor_id,
    deliveredLines: toInt(r.delivered_lines),
    onTimeLines: toInt(r.on_time_lines),
    qaPassedLines: toInt(r.qa_passed_lines),
    qaCheckedLines: toInt(r.qa_checked_lines),
    acceptedDeliveries: toInt(r.accepted_deliveries),
    totalDeliveries: toInt(r.total_deliveries),
    avgUnitPriceUsdMinor: toNullableNum(r.avg_unit_price_usd_minor),
    quotationsReturned: toInt(r.quotations_returned),
    avgQuoteTurnaroundDays: toNullableNum(r.avg_quote_turnaround_days),
  };
}

/**
 * Per-vendor trailing-90d aggregate. Org-scoped. Returns one row per
 * active vendor that has at least one PO, delivery, or quotation in the
 * window — vendors with no procurement signal are skipped (they get a
 * neutral compute-on-read score on the surface instead).
 */
export async function loadVendorHistoryAggregates(
  organizationId: string,
): Promise<VendorHistoryAggregate[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<AggregateRow>(sql`
    WITH window_deliveries AS (
      SELECT d.id           AS delivery_id,
             d.po_id        AS po_id,
             po.vendor_id   AS vendor_id,
             d.delivery_date,
             d.quality_check_status,
             po.expected_delivery_date
        FROM material_deliveries d
        JOIN material_purchase_orders po ON po.id = d.po_id
       WHERE po.organization_id = ${organizationId}
         AND d.delivery_date >= CURRENT_DATE - INTERVAL '90 days'
    ),
    line_stats AS (
      SELECT wd.vendor_id,
             COUNT(*) FILTER (
               WHERE wd.expected_delivery_date IS NOT NULL
             )                                                AS delivered_lines,
             COUNT(*) FILTER (
               WHERE wd.expected_delivery_date IS NOT NULL
                 AND wd.delivery_date <= wd.expected_delivery_date
             )                                                AS on_time_lines,
             COUNT(*) FILTER (WHERE dl.quality_check_passed)  AS qa_passed_lines,
             COUNT(*)                                         AS qa_checked_lines
        FROM window_deliveries wd
        JOIN material_delivery_lines dl ON dl.delivery_id = wd.delivery_id
       GROUP BY wd.vendor_id
    ),
    header_stats AS (
      SELECT wd.vendor_id,
             COUNT(*) FILTER (
               WHERE wd.quality_check_status = 'accepted'
             )                                                AS accepted_deliveries,
             COUNT(*)                                         AS total_deliveries
        FROM window_deliveries wd
       GROUP BY wd.vendor_id
    ),
    price_stats AS (
      SELECT po.vendor_id,
             (SUM(pl.unit_price_usd_minor * pl.quantity_ordered)
               / NULLIF(SUM(pl.quantity_ordered), 0))::bigint AS avg_unit_price_usd_minor
        FROM material_purchase_orders po
        JOIN material_po_lines pl ON pl.po_id = po.id
       WHERE po.organization_id = ${organizationId}
         AND po.order_date >= CURRENT_DATE - INTERVAL '90 days'
       GROUP BY po.vendor_id
    ),
    rfq_stats AS (
      SELECT q.vendor_id,
             COUNT(*)                                         AS quotations_returned,
             AVG(GREATEST(q.quoted_at - pr.created_at::date, 0))::numeric
                                                              AS avg_quote_turnaround_days
        FROM procurement_quotations q
        JOIN dev_os_purchase_requests pr ON pr.id = q.purchase_request_id
       WHERE q.organization_id = ${organizationId}
         AND q.quoted_at >= CURRENT_DATE - INTERVAL '90 days'
       GROUP BY q.vendor_id
    )
    SELECT v.id::text                                         AS vendor_id,
           ls.delivered_lines::text                           AS delivered_lines,
           ls.on_time_lines::text                             AS on_time_lines,
           ls.qa_passed_lines::text                           AS qa_passed_lines,
           ls.qa_checked_lines::text                          AS qa_checked_lines,
           hs.accepted_deliveries::text                       AS accepted_deliveries,
           hs.total_deliveries::text                          AS total_deliveries,
           ps.avg_unit_price_usd_minor::text                  AS avg_unit_price_usd_minor,
           rs.quotations_returned::text                       AS quotations_returned,
           rs.avg_quote_turnaround_days::text                 AS avg_quote_turnaround_days
      FROM vendors v
      LEFT JOIN line_stats   ls ON ls.vendor_id = v.id
      LEFT JOIN header_stats hs ON hs.vendor_id = v.id
      LEFT JOIN price_stats  ps ON ps.vendor_id = v.id
      LEFT JOIN rfq_stats    rs ON rs.vendor_id = v.id
     WHERE v.organization_id = ${organizationId}
       AND v.status = 'active'
       AND (ls.vendor_id IS NOT NULL
            OR hs.vendor_id IS NOT NULL
            OR ps.vendor_id IS NOT NULL
            OR rs.vendor_id IS NOT NULL)
  `);
  return rowsOf<AggregateRow>(rows).map(rowToAggregate);
}

/**
 * Latest composite band per vendor from the prior run, used to detect
 * band crossings for the nightly digest.
 */
async function loadPreviousBands(
  organizationId: string,
): Promise<Map<string, VendorScoreBand>> {
  const db = getDb();
  const out = new Map<string, VendorScoreBand>();
  if (!db) return out;
  const rows = await db.execute<{ vendor_id: string; composite: string }>(sql`
    SELECT DISTINCT ON (vs.vendor_id)
           vs.vendor_id::text AS vendor_id,
           vs.composite::text  AS composite
      FROM vendor_scores vs
      JOIN vendors v ON v.id = vs.vendor_id
     WHERE v.organization_id = ${organizationId}
     ORDER BY vs.vendor_id, vs.computed_at DESC
  `);
  for (const r of rowsOf<{ vendor_id: string; composite: string }>(rows)) {
    out.set(r.vendor_id, bandOf(Number(r.composite)));
  }
  return out;
}

function bandOf(composite: number): VendorScoreBand {
  return composite >= 85 ? "high" : composite >= 65 ? "mid" : "low";
}

export async function run(
  input: VendorScoreUpdaterInput,
): Promise<VendorScoreUpdaterOutput> {
  const db = getDb();
  if (!db) return { updated: 0, bandChanges: [] };

  const aggregates = await loadVendorHistoryAggregates(input.organizationId);
  if (aggregates.length === 0) return { updated: 0, bandChanges: [] };

  const previousBands = await loadPreviousBands(input.organizationId);
  const scored = scoreCohort(aggregates);

  const rowsToInsert = scored.map(({ vendorId, result }) => ({
    vendorId,
    composite: result.composite,
    priceScore: clampInt(result.components.price),
    onTimeScore: clampInt(result.components.delivery),
    qaScore: clampInt(result.components.quality),
    responsiveScore: clampInt(result.components.responsiveness),
    scoreWindow: SCORE_WINDOW,
  }));

  if (rowsToInsert.length > 0) {
    await db.insert(vendorScores).values(rowsToInsert);
  }

  const bandChanges: VendorScoreUpdaterOutput["bandChanges"] = [];
  for (const { vendorId, result } of scored) {
    const prev = previousBands.get(vendorId);
    if (prev && prev !== result.band) {
      bandChanges.push({ vendorId, from: prev, to: result.band });
    }
  }

  return { updated: rowsToInsert.length, bandChanges };
}

function clampInt(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export const VENDOR_SCORE_UPDATER_AGENT = {
  agentCode: "vendor-score-updater",
  cron: "0 3 * * *",
  description:
    "Nightly vendor composite score refresh from PO/delivery/RFQ history.",
} as const;

// Re-export for convenience.
export type { VendorScoreComponents };
