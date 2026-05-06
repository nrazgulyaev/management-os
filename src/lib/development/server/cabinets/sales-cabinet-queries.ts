import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface SalesCabinetData {
  hotLeadsCount: number;
  activeConversationsCount: number;
  reservationsThisMonth: number;
  contractsThisMonth: number;
  followupsOverdueCount: number;
  managerWeeklySnapshot: {
    leadToReservationRate: string | null;
    averageResponseTimeMinutes: string | null;
    aiQualityScore: string | null;
  } | null;
  topHotLeads: Array<{ id: string; leadCode: string; lifecycleStatus: string }>;
}

export async function loadSalesCabinet(
  managerId: string,
): Promise<SalesCabinetData> {
  const db = getDb();
  if (!db) {
    return {
      hotLeadsCount: 0,
      activeConversationsCount: 0,
      reservationsThisMonth: 0,
      contractsThisMonth: 0,
      followupsOverdueCount: 0,
      managerWeeklySnapshot: null,
      topHotLeads: [],
    };
  }
  const summary = await db.execute<{
    hot: string;
    active_conv: string;
    res_month: string;
    cont_month: string;
    overdue: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM leads
        WHERE assigned_manager_id = ${managerId}::uuid
          AND lifecycle_status = 'hot') AS hot,
      (SELECT COUNT(*)::text FROM sales_conversation_threads
        WHERE primary_sales_manager_id = ${managerId}::uuid
          AND (outcome IS NULL OR outcome IN ('still_active', 'on_hold'))) AS active_conv,
      (SELECT COUNT(*)::text FROM leads
        WHERE assigned_manager_id = ${managerId}::uuid
          AND lifecycle_status = 'reservation'
          AND lifecycle_status_changed_at >= date_trunc('month', now())) AS res_month,
      (SELECT COUNT(*)::text FROM leads
        WHERE assigned_manager_id = ${managerId}::uuid
          AND lifecycle_status = 'contract'
          AND lifecycle_status_changed_at >= date_trunc('month', now())) AS cont_month,
      (SELECT COUNT(*)::text FROM sales_conversation_threads
        WHERE primary_sales_manager_id = ${managerId}::uuid
          AND (outcome IS NULL OR outcome IN ('still_active', 'on_hold'))
          AND last_message_at < now() - INTERVAL '5 days') AS overdue
  `);
  const s =
    (summary as unknown as {
      rows: Array<{
        hot: string;
        active_conv: string;
        res_month: string;
        cont_month: string;
        overdue: string;
      }>;
    }).rows?.[0] ?? null;

  const snapRow = await db.execute<{
    rate: string;
    resp: string;
    score: string;
  }>(sql`
    SELECT lead_to_reservation_rate::text AS rate,
           average_response_time_minutes::text AS resp,
           ai_quality_score::text AS score
      FROM manager_performance_metrics
     WHERE manager_id = ${managerId}::uuid AND period_type = 'weekly'
     ORDER BY period_start DESC LIMIT 1
  `);
  const snap =
    (snapRow as unknown as {
      rows: Array<{ rate: string; resp: string; score: string }>;
    }).rows?.[0] ?? null;

  const hotRows = await db.execute<{
    id: string;
    lead_code: string;
    lifecycle_status: string;
  }>(sql`
    SELECT id::text, lead_code, lifecycle_status FROM leads
     WHERE assigned_manager_id = ${managerId}::uuid
       AND lifecycle_status IN ('hot', 'qualified')
     ORDER BY lifecycle_status_changed_at DESC LIMIT 5
  `);

  return {
    hotLeadsCount: Number(s?.hot ?? "0"),
    activeConversationsCount: Number(s?.active_conv ?? "0"),
    reservationsThisMonth: Number(s?.res_month ?? "0"),
    contractsThisMonth: Number(s?.cont_month ?? "0"),
    followupsOverdueCount: Number(s?.overdue ?? "0"),
    managerWeeklySnapshot: snap
      ? {
          leadToReservationRate: snap.rate ?? null,
          averageResponseTimeMinutes: snap.resp ?? null,
          aiQualityScore: snap.score ?? null,
        }
      : null,
    topHotLeads:
      (hotRows as unknown as {
        rows: Array<{ id: string; lead_code: string; lifecycle_status: string }>;
      }).rows?.map((r) => ({
        id: r.id,
        leadCode: r.lead_code,
        lifecycleStatus: r.lifecycle_status,
      })) ?? [],
  };
}
