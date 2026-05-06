import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface ProjectManagerCabinetData {
  projects: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  totals: {
    activeProjectsCount: number;
    openQaQcCount: number;
    openRisksCount: number;
    pendingChangeOrdersCount: number;
  };
  latestDailyDigestCode: string | null;
  latestWeeklyPlanCode: string | null;
  recentMemoryItemsCount: number;
}

export async function loadProjectManagerCabinet(): Promise<ProjectManagerCabinetData> {
  const db = getDb();
  if (!db) {
    return {
      projects: [],
      totals: {
        activeProjectsCount: 0,
        openQaQcCount: 0,
        openRisksCount: 0,
        pendingChangeOrdersCount: 0,
      },
      latestDailyDigestCode: null,
      latestWeeklyPlanCode: null,
      recentMemoryItemsCount: 0,
    };
  }

  const projRows = await db.execute<{ id: string; name: string; status: string }>(sql`
    SELECT id::text, name, status
      FROM projects
     WHERE status NOT IN ('completed', 'paused', 'archived')
     ORDER BY created_at DESC
     LIMIT 12
  `);
  const projects =
    (projRows as unknown as { rows: Array<{ id: string; name: string; status: string }> })
      .rows ?? [];

  const totalsRow = await db.execute<{
    active: string;
    qaqc: string;
    risks: string;
    cos: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM projects WHERE status NOT IN ('completed','paused','archived')) AS active,
      (SELECT COUNT(*)::text FROM qa_qc_issues WHERE status NOT IN ('closed','resolved')) AS qaqc,
      (SELECT COUNT(*)::text FROM risk_register WHERE status NOT IN ('closed','mitigated')) AS risks,
      (SELECT COUNT(*)::text FROM change_orders WHERE status = 'pending') AS cos
  `);
  const totals =
    (totalsRow as unknown as {
      rows: Array<{ active: string; qaqc: string; risks: string; cos: string }>;
    }).rows?.[0] ?? null;

  const dailyRow = await db.execute<{ output_code: string }>(sql`
    SELECT output_code FROM agent_outputs
     WHERE agent_key = 'daily_digest'
     ORDER BY created_at DESC LIMIT 1
  `);
  const weeklyRow = await db.execute<{ output_code: string }>(sql`
    SELECT output_code FROM agent_outputs
     WHERE agent_key = 'weekly_plan'
     ORDER BY created_at DESC LIMIT 1
  `);
  const memRow = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM project_ai_memory
     WHERE is_active = TRUE
       AND last_observed_at >= CURRENT_DATE - INTERVAL '14 days'
  `);

  return {
    projects,
    totals: {
      activeProjectsCount: Number(totals?.active ?? "0"),
      openQaQcCount: Number(totals?.qaqc ?? "0"),
      openRisksCount: Number(totals?.risks ?? "0"),
      pendingChangeOrdersCount: Number(totals?.cos ?? "0"),
    },
    latestDailyDigestCode:
      (dailyRow as unknown as { rows: Array<{ output_code: string }> }).rows?.[0]
        ?.output_code ?? null,
    latestWeeklyPlanCode:
      (weeklyRow as unknown as { rows: Array<{ output_code: string }> }).rows?.[0]
        ?.output_code ?? null,
    recentMemoryItemsCount: Number(
      (memRow as unknown as { rows: Array<{ n: string }> }).rows?.[0]?.n ?? "0",
    ),
  };
}
