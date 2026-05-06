import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface MarketingCabinetData {
  contentByStatus: Record<string, number>;
  contentApprovalQueueCount: number;
  scheduledThisWeekCount: number;
  recentlyPublishedCount: number;
  activeCampaignsCount: number;
  leadsThisWeek: number;
  hotLeadsCount: number;
  latestMarketingAssistantOutputCode: string | null;
}

export async function loadMarketingCabinet(): Promise<MarketingCabinetData> {
  const db = getDb();
  if (!db) {
    return {
      contentByStatus: {},
      contentApprovalQueueCount: 0,
      scheduledThisWeekCount: 0,
      recentlyPublishedCount: 0,
      activeCampaignsCount: 0,
      leadsThisWeek: 0,
      hotLeadsCount: 0,
      latestMarketingAssistantOutputCode: null,
    };
  }
  const statusRows = await db.execute<{ status: string; n: string }>(sql`
    SELECT status, COUNT(*)::text AS n FROM content_pieces GROUP BY status
  `);
  const contentByStatus: Record<string, number> = {};
  for (const r of (statusRows as unknown as {
    rows: Array<{ status: string; n: string }>;
  }).rows ?? []) {
    contentByStatus[r.status] = Number(r.n);
  }

  const summary = await db.execute<{
    review: string;
    sched_week: string;
    recent_pub: string;
    active_camp: string;
    leads_week: string;
    hot: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM content_pieces WHERE status = 'pending_review') AS review,
      (SELECT COUNT(*)::text FROM content_pieces
        WHERE status = 'scheduled' AND scheduled_publish_at < now() + INTERVAL '7 days') AS sched_week,
      (SELECT COUNT(*)::text FROM content_pieces
        WHERE status = 'published' AND published_at >= now() - INTERVAL '7 days') AS recent_pub,
      (SELECT COUNT(*)::text FROM campaigns WHERE status = 'active') AS active_camp,
      (SELECT COUNT(*)::text FROM leads
        WHERE created_at >= now() - INTERVAL '7 days') AS leads_week,
      (SELECT COUNT(*)::text FROM leads WHERE lifecycle_status = 'hot') AS hot
  `);
  const s =
    (summary as unknown as {
      rows: Array<{
        review: string;
        sched_week: string;
        recent_pub: string;
        active_camp: string;
        leads_week: string;
        hot: string;
      }>;
    }).rows?.[0] ?? null;

  const latestMa = await db.execute<{ output_code: string }>(sql`
    SELECT output_code FROM agent_outputs
     WHERE agent_key = 'marketing_assistant'
     ORDER BY created_at DESC LIMIT 1
  `);

  return {
    contentByStatus,
    contentApprovalQueueCount: Number(s?.review ?? "0"),
    scheduledThisWeekCount: Number(s?.sched_week ?? "0"),
    recentlyPublishedCount: Number(s?.recent_pub ?? "0"),
    activeCampaignsCount: Number(s?.active_camp ?? "0"),
    leadsThisWeek: Number(s?.leads_week ?? "0"),
    hotLeadsCount: Number(s?.hot ?? "0"),
    latestMarketingAssistantOutputCode:
      (latestMa as unknown as { rows: Array<{ output_code: string }> }).rows?.[0]
        ?.output_code ?? null,
  };
}
