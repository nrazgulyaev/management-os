import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface QsCabinetData {
  activeBoqCount: number;
  recentBoqs: Array<{ id: string; title: string; status: string }>;
  latestQsAnalystOutputCode: string | null;
  awaitingQsAnalysisCount: number;
  recentSpecificationsCount: number;
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
    };
  }
  const summary = await db.execute<{
    active_boqs: string;
    awaiting_qs: string;
    spec_recent: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM boq_documents
        WHERE status NOT IN ('archived')) AS active_boqs,
      (SELECT COUNT(*)::text FROM agent_outputs
        WHERE agent_key = 'qs_cost_analyst' AND status = 'awaiting_review') AS awaiting_qs,
      (SELECT COUNT(*)::text FROM specifications
        WHERE created_at >= now() - INTERVAL '30 days') AS spec_recent
  `);
  const s =
    (summary as unknown as {
      rows: Array<{ active_boqs: string; awaiting_qs: string; spec_recent: string }>;
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

  return {
    activeBoqCount: Number(s?.active_boqs ?? "0"),
    awaitingQsAnalysisCount: Number(s?.awaiting_qs ?? "0"),
    recentSpecificationsCount: Number(s?.spec_recent ?? "0"),
    recentBoqs:
      (recentBoqs as unknown as {
        rows: Array<{ id: string; title: string; status: string }>;
      }).rows ?? [],
    latestQsAnalystOutputCode:
      (latestQs as unknown as { rows: Array<{ output_code: string }> }).rows?.[0]
        ?.output_code ?? null,
  };
}
