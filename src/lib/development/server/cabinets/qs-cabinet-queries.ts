import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

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
    (summary as unknown as {
      rows: Array<{
        active_boqs: string;
        awaiting_qs: string;
        spec_recent: string;
        boqs_under_review: string;
        open_cos: string;
        anomalies_week: string;
      }>;
    }).rows?.[0] ?? null;

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
      (recentBoqs as unknown as {
        rows: Array<{ id: string; title: string; status: string }>;
      }).rows ?? [],
    latestQsAnalystOutputCode:
      (latestQs as unknown as { rows: Array<{ output_code: string }> }).rows?.[0]
        ?.output_code ?? null,
    anomaliesLast7Days:
      (dailyAnomalies as unknown as {
        rows: Array<{ iso_date: string; count: string }>;
      }).rows?.map((r) => ({
        isoDate: r.iso_date,
        count: Number(r.count ?? "0"),
      })) ?? [],
    recentQsAnalystOutputs:
      (recentOutputs as unknown as {
        rows: Array<{
          output_code: string;
          title: string;
          summary: string;
          created_at: string;
        }>;
      }).rows?.map((r) => ({
        outputCode: r.output_code,
        title: r.title,
        summary: r.summary,
        createdAt: r.created_at,
      })) ?? [],
  };
}
