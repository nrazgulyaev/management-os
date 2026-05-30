import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";

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
  /**
   * Phase 2 — pipeline counts by lifecycle stage, sourced from the
   * leads table where assigned_manager_id matches. Drives the
   * LeadFunnelChart on the cabinet apex.
   */
  funnelByLifecycle: Array<{ lifecycleStatus: string; count: number }>;
  /**
   * Phase 2 — conversation activity bucketed by ISO date for the
   * last 7 days. Drives the HatchedBarChart "Today's pulse" tile.
   */
  conversationsLast7Days: Array<{ isoDate: string; count: number }>;
}

export async function loadSalesCabinet(
  managerId: string | null,
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
      funnelByLifecycle: [],
      conversationsLast7Days: [],
    };
  }
  // QA-FIXES-1 P5: managerId=null returns org-wide aggregates instead of
  // filtering by assigned manager. Used by the sales-manager cabinet page
  // as a fallback when the current user (typically super_admin) has no
  // assigned leads — showing zeros for someone with super_admin role is
  // misleading because the data exists, just isn't assigned to them.
  const mgrLeadFilter = managerId
    ? sql`AND assigned_manager_id = ${managerId}::uuid`
    : sql``;
  const mgrConvFilter = managerId
    ? sql`AND primary_sales_manager_id = ${managerId}::uuid`
    : sql``;
  const summary = await db.execute<{
    hot: string;
    active_conv: string;
    res_month: string;
    cont_month: string;
    overdue: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM leads
        WHERE lifecycle_status = 'hot'
          ${mgrLeadFilter}) AS hot,
      (SELECT COUNT(*)::text FROM sales_conversation_threads
        WHERE (outcome IS NULL OR outcome IN ('still_active', 'on_hold'))
          ${mgrConvFilter}) AS active_conv,
      (SELECT COUNT(*)::text FROM leads
        WHERE lifecycle_status = 'reservation'
          AND lifecycle_status_changed_at >= date_trunc('month', now())
          ${mgrLeadFilter}) AS res_month,
      (SELECT COUNT(*)::text FROM leads
        WHERE lifecycle_status = 'contract'
          AND lifecycle_status_changed_at >= date_trunc('month', now())
          ${mgrLeadFilter}) AS cont_month,
      (SELECT COUNT(*)::text FROM sales_conversation_threads
        WHERE (outcome IS NULL OR outcome IN ('still_active', 'on_hold'))
          AND last_message_at < now() - INTERVAL '5 days'
          ${mgrConvFilter}) AS overdue
  `);
  const s =
    rowsOf<{
        hot: string;
        active_conv: string;
        res_month: string;
        cont_month: string;
        overdue: string;
      }>(summary)[0] ?? null;

  const snapRow = managerId
    ? await db.execute<{
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
      `)
    : { rows: [] };
  const snap =
    rowsOf<{ rate: string; resp: string; score: string }>(snapRow)[0] ?? null;

  const hotRows = await db.execute<{
    id: string;
    lead_code: string;
    lifecycle_status: string;
  }>(sql`
    SELECT id::text, lead_code, lifecycle_status FROM leads
     WHERE lifecycle_status IN ('hot', 'qualified')
       ${mgrLeadFilter}
     ORDER BY lifecycle_status_changed_at DESC LIMIT 5
  `);

  const funnelRows = await db.execute<{
    lifecycle_status: string;
    count: string;
  }>(sql`
    SELECT lifecycle_status, COUNT(*)::text AS count
      FROM leads
     WHERE lifecycle_status IS NOT NULL
       ${mgrLeadFilter}
     GROUP BY lifecycle_status
  `);

  const convRows = await db.execute<{
    iso_date: string;
    count: string;
  }>(sql`
    SELECT to_char(date_trunc('day', last_message_at), 'YYYY-MM-DD') AS iso_date,
           COUNT(*)::text AS count
      FROM sales_conversation_threads
     WHERE last_message_at >= (now() - INTERVAL '7 days')
       ${mgrConvFilter}
     GROUP BY 1
     ORDER BY 1 ASC
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
      rowsOf<{ id: string; lead_code: string; lifecycle_status: string }>(hotRows).map((r) => ({
        id: r.id,
        leadCode: r.lead_code,
        lifecycleStatus: r.lifecycle_status,
      })) ?? [],
    funnelByLifecycle:
      rowsOf<{ lifecycle_status: string; count: string }>(funnelRows).map((r) => ({
        lifecycleStatus: r.lifecycle_status,
        count: Number(r.count ?? "0"),
      })) ?? [],
    conversationsLast7Days:
      rowsOf<{ iso_date: string; count: string }>(convRows).map((r) => ({
        isoDate: r.iso_date,
        count: Number(r.count ?? "0"),
      })) ?? [],
  };
}
