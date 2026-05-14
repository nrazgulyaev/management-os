import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * Stage 10.5.A.1.3 — PM cabinet data aggregator (extended).
 *
 * Original Stage 6 baseline: portfolio totals + project list + AI
 * insights. Stage 10.5.A.1 extends with:
 *   - per-project at-risk score (open QA/QC + open risks + pending
 *     change orders) so the dashboard can render a "Critical path"
 *     mini-feed.
 *   - per-project budget snapshot (sum of dev_budget_lines) — used
 *     to flag projects without a baseline.
 *
 * Trend deltas are not derived here (no per-period snapshot table for
 * PM totals exists yet). Carry-over for 10.5.A.2: roll up
 * project_ai_memory hits into a 7-day vs 14-day comparison.
 */
export interface PmProjectRow {
  id: string;
  name: string;
  status: string;
  riskScore: number;
  openQaQcCount: number;
  openRisksCount: number;
  pendingChangeOrdersCount: number;
  budgetUsdMinor: number | null;
}

export interface ProjectManagerCabinetData {
  projects: Array<{ id: string; name: string; status: string }>;
  projectsAtRisk: PmProjectRow[];
  totals: {
    activeProjectsCount: number;
    openQaQcCount: number;
    openRisksCount: number;
    pendingChangeOrdersCount: number;
  };
  latestDailyDigestCode: string | null;
  latestWeeklyPlanCode: string | null;
  recentMemoryItemsCount: number;
  /**
   * Phase 6 — daily QA/QC + change-order creation cadence over the
   * last 7 days. Drives the HatchedBarChart in Today's pulse.
   */
  activityLast7Days: Array<{ isoDate: string; count: number }>;
  /**
   * Phase 6 — top 3 recent PM-relevant agent outputs across
   * daily_construction_digest / weekly_construction_plan /
   * executive_business agents.
   */
  recentPmAgentOutputs: Array<{
    agentKey: string;
    outputCode: string;
    title: string;
    summary: string;
    createdAt: string;
  }>;
}

const EMPTY: ProjectManagerCabinetData = {
  projects: [],
  projectsAtRisk: [],
  totals: {
    activeProjectsCount: 0,
    openQaQcCount: 0,
    openRisksCount: 0,
    pendingChangeOrdersCount: 0,
  },
  latestDailyDigestCode: null,
  latestWeeklyPlanCode: null,
  recentMemoryItemsCount: 0,
  activityLast7Days: [],
  recentPmAgentOutputs: [],
};

export async function loadProjectManagerCabinet(): Promise<ProjectManagerCabinetData> {
  const db = getDb();
  if (!db) return EMPTY;

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

  const atRiskRow = await db.execute<{
    id: string;
    name: string;
    status: string;
    qaqc: string;
    risks: string;
    cos: string;
    budget: string | null;
  }>(sql`
    SELECT
      p.id::text,
      p.name,
      p.status,
      COALESCE((SELECT COUNT(*) FROM qa_qc_issues q WHERE q.project_id = p.id AND q.status NOT IN ('closed','resolved')), 0)::text AS qaqc,
      COALESCE((SELECT COUNT(*) FROM risk_register r WHERE r.project_id = p.id AND r.status NOT IN ('closed','mitigated')), 0)::text AS risks,
      COALESCE((SELECT COUNT(*) FROM change_orders co WHERE co.project_id = p.id AND co.status = 'pending'), 0)::text AS cos,
      COALESCE((SELECT SUM(budgeted_amount_usd_minor)::text FROM dev_budget_lines b WHERE b.project_id = p.id AND b.superseded_at IS NULL), NULL) AS budget
    FROM projects p
   WHERE p.status NOT IN ('completed','paused','archived')
   ORDER BY (
     COALESCE((SELECT COUNT(*) FROM qa_qc_issues q WHERE q.project_id = p.id AND q.status NOT IN ('closed','resolved')), 0)
     + COALESCE((SELECT COUNT(*) FROM risk_register r WHERE r.project_id = p.id AND r.status NOT IN ('closed','mitigated')), 0)
     + COALESCE((SELECT COUNT(*) FROM change_orders co WHERE co.project_id = p.id AND co.status = 'pending'), 0)
   ) DESC
   LIMIT 5
  `);
  const projectsAtRisk: PmProjectRow[] = (
    (atRiskRow as unknown as {
      rows: Array<{
        id: string;
        name: string;
        status: string;
        qaqc: string;
        risks: string;
        cos: string;
        budget: string | null;
      }>;
    }).rows ?? []
  )
    .map((r) => {
      const qaqc = Number(r.qaqc);
      const risks = Number(r.risks);
      const cos = Number(r.cos);
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        openQaQcCount: qaqc,
        openRisksCount: risks,
        pendingChangeOrdersCount: cos,
        riskScore: qaqc + risks * 2 + cos,
        budgetUsdMinor: r.budget !== null ? Number(r.budget) : null,
      };
    })
    .filter((r) => r.riskScore > 0);

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

  const activityRows = await db.execute<{
    iso_date: string;
    count: string;
  }>(sql`
    SELECT to_char(d::date, 'YYYY-MM-DD') AS iso_date, COUNT(*)::text AS count
      FROM (
        SELECT created_at AS d FROM qa_qc_issues
         WHERE created_at >= (now() - INTERVAL '7 days')
        UNION ALL
        SELECT requested_at::timestamptz AS d FROM change_orders
         WHERE requested_at >= (CURRENT_DATE - INTERVAL '7 days')
      ) events
     GROUP BY 1
     ORDER BY 1 ASC
  `);

  const recentOutputs = await db.execute<{
    agent_key: string;
    output_code: string;
    title: string;
    summary: string;
    created_at: string;
  }>(sql`
    SELECT agent_key, output_code, title, summary, created_at::text
      FROM agent_outputs
     WHERE agent_key IN (
       'daily_construction_digest',
       'daily_digest',
       'weekly_construction_plan',
       'weekly_plan',
       'executive_business'
     )
     ORDER BY created_at DESC LIMIT 3
  `);

  return {
    projects,
    projectsAtRisk,
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
    activityLast7Days:
      (activityRows as unknown as {
        rows: Array<{ iso_date: string; count: string }>;
      }).rows?.map((r) => ({
        isoDate: r.iso_date,
        count: Number(r.count ?? "0"),
      })) ?? [],
    recentPmAgentOutputs:
      (recentOutputs as unknown as {
        rows: Array<{
          agent_key: string;
          output_code: string;
          title: string;
          summary: string;
          created_at: string;
        }>;
      }).rows?.map((r) => ({
        agentKey: r.agent_key,
        outputCode: r.output_code,
        title: r.title,
        summary: r.summary,
        createdAt: r.created_at,
      })) ?? [],
  };
}
