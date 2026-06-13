import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

export interface MarketingCabinetData {
  contentByStatus: Record<string, number>;
  contentApprovalQueueCount: number;
  scheduledThisWeekCount: number;
  recentlyPublishedCount: number;
  activeCampaignsCount: number;
  leadsThisWeek: number;
  hotLeadsCount: number;
  latestMarketingAssistantOutputCode: string | null;
  /** Phase 7 — content-publish cadence over last 7 days. */
  publishesLast7Days: Array<{ isoDate: string; count: number }>;
  /** Phase 7 — lead pipeline by lifecycle stage for the funnel. */
  funnelByLifecycle: Array<{ lifecycleStatus: string; count: number }>;
  /** Phase 7 — top 3 marketing-assistant outputs for the inline AI grid. */
  recentMarketingAssistantOutputs: Array<{
    outputCode: string;
    title: string;
    summary: string;
    createdAt: string;
  }>;
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
      publishesLast7Days: [],
      funnelByLifecycle: [],
      recentMarketingAssistantOutputs: [],
    };
  }
  const organizationId = await requireOrgId();
  const statusRows = await db.execute<{ status: string; n: string }>(sql`
    SELECT status, COUNT(*)::text AS n FROM content_pieces
     WHERE organization_id = ${organizationId}
     GROUP BY status
  `);
  const contentByStatus: Record<string, number> = {};
  for (const r of rowsOf<{ status: string; n: string }>(statusRows)) {
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
      (SELECT COUNT(*)::text FROM content_pieces WHERE status = 'pending_review' AND organization_id = ${organizationId}) AS review,
      (SELECT COUNT(*)::text FROM content_pieces
        WHERE status = 'scheduled' AND scheduled_publish_at < now() + INTERVAL '7 days' AND organization_id = ${organizationId}) AS sched_week,
      (SELECT COUNT(*)::text FROM content_pieces
        WHERE status = 'published' AND published_at >= now() - INTERVAL '7 days' AND organization_id = ${organizationId}) AS recent_pub,
      (SELECT COUNT(*)::text FROM campaigns WHERE status = 'active' AND organization_id = ${organizationId}) AS active_camp,
      (SELECT COUNT(*)::text FROM leads
        WHERE created_at >= now() - INTERVAL '7 days' AND organization_id = ${organizationId}) AS leads_week,
      (SELECT COUNT(*)::text FROM leads WHERE lifecycle_status = 'hot' AND organization_id = ${organizationId}) AS hot
  `);
  const s =
    rowsOf<{
        review: string;
        sched_week: string;
        recent_pub: string;
        active_camp: string;
        leads_week: string;
        hot: string;
      }>(summary)[0] ?? null;

  const latestMa = await db.execute<{ output_code: string }>(sql`
    SELECT output_code FROM agent_outputs
     WHERE agent_key = 'marketing_assistant'
       AND organization_id = ${organizationId}
     ORDER BY created_at DESC LIMIT 1
  `);

  const dailyPublishes = await db.execute<{
    iso_date: string;
    count: string;
  }>(sql`
    SELECT to_char(date_trunc('day', published_at), 'YYYY-MM-DD') AS iso_date,
           COUNT(*)::text AS count
      FROM content_pieces
     WHERE status = 'published'
       AND published_at >= (now() - INTERVAL '7 days')
       AND organization_id = ${organizationId}
     GROUP BY 1
     ORDER BY 1 ASC
  `);

  const funnelRows = await db.execute<{
    lifecycle_status: string;
    count: string;
  }>(sql`
    SELECT lifecycle_status, COUNT(*)::text AS count
      FROM leads
     WHERE lifecycle_status IS NOT NULL
       AND organization_id = ${organizationId}
     GROUP BY lifecycle_status
  `);

  const recentOutputs = await db.execute<{
    output_code: string;
    title: string;
    summary: string;
    created_at: string;
  }>(sql`
    SELECT output_code, title, summary, created_at::text
      FROM agent_outputs
     WHERE agent_key = 'marketing_assistant'
       AND organization_id = ${organizationId}
     ORDER BY created_at DESC LIMIT 3
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
      rowsOf<{ output_code: string }>(latestMa)[0]
        ?.output_code ?? null,
    publishesLast7Days:
      rowsOf<{ iso_date: string; count: string }>(dailyPublishes).map((r) => ({
        isoDate: r.iso_date,
        count: Number(r.count ?? "0"),
      })) ?? [],
    funnelByLifecycle:
      rowsOf<{ lifecycle_status: string; count: string }>(funnelRows).map((r) => ({
        lifecycleStatus: r.lifecycle_status,
        count: Number(r.count ?? "0"),
      })) ?? [],
    recentMarketingAssistantOutputs:
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
