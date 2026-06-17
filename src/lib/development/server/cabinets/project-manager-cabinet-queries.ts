import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
// SHAPE-FIX-1 / DAILY-DIGEST P0.5 — rowsOf handles postgres-js Array shape.
// TODO(DB-SHAPE-CODEMOD-1): adjacent Dev OS cabinet files still pending sweep.
import { requireOrgId } from "@/features/auth/require-org";

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
  const projects = rowsOf<{ id: string; name: string; status: string }>(projRows);

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
  const totals = rowsOf<{
    active: string; qaqc: string; risks: string; cos: string;
  }>(totalsRow)[0] ?? null;

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
  const projectsAtRisk: PmProjectRow[] = rowsOf<{
    id: string;
    name: string;
    status: string;
    qaqc: string;
    risks: string;
    cos: string;
    budget: string | null;
  }>(atRiskRow)
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
      rowsOf<{ output_code: string }>(dailyRow)[0]?.output_code ?? null,
    latestWeeklyPlanCode:
      rowsOf<{ output_code: string }>(weeklyRow)[0]?.output_code ?? null,
    recentMemoryItemsCount: Number(
      rowsOf<{ n: string }>(memRow)[0]?.n ?? "0",
    ),
    activityLast7Days: rowsOf<{ iso_date: string; count: string }>(
      activityRows,
    ).map((r) => ({
      isoDate: r.iso_date,
      count: Number(r.count ?? "0"),
    })),
    recentPmAgentOutputs: rowsOf<{
      agent_key: string;
      output_code: string;
      title: string;
      summary: string;
      created_at: string;
    }>(recentOutputs).map((r) => ({
      agentKey: r.agent_key,
      outputCode: r.output_code,
      title: r.title,
      summary: r.summary,
      createdAt: r.created_at,
    })),
  };
}

// =============================================================================
// Sprint TASK-7-DATA-PART-2 — PM cabinet view readers for the prototype.
//
// The _handoff/ PM cabinet (`/development-os/cabinets/project-manager/
// page.tsx`) needs three list-shaped reads:
//
//   - listWorkPackagesByStatus()  → kanban-shaped grouping
//   - listAtRiskPackages()        → portfolio-at-risk side rail
//   - getLatestDailyDigest()      → daily digest narrative body
//
// All org-scoped via requireOrgId() (TENANT-1). DEMO-1 didn't seed
// work_packages or daily-digest agent_outputs, so the kanban + digest
// reads are expected to return empty for the Arconique org today —
// the cabinet renders friendly empty states.
// =============================================================================

export type WpStatus =
  | "planned"
  | "ready_to_start"
  | "in_progress"
  | "completed"
  | "on_hold"
  | "cancelled";

export interface WorkPackageRow {
  id: string;
  packageCode: string;
  name: string;
  projectId: string;
  projectCode: string | null;
  projectSlug: string | null;
  status: WpStatus;
  progressPercentage: number;
  responsibleUserName: string | null;
  primaryVendorName: string | null;
  budgetMinor: number | null;
  actualMinor: number | null;
  plannedFinish: string | null;
}

export async function listWorkPackagesByStatus(): Promise<
  Record<WpStatus, WorkPackageRow[]>
> {
  const empty = {
    planned: [],
    ready_to_start: [],
    in_progress: [],
    completed: [],
    on_hold: [],
    cancelled: [],
  } satisfies Record<WpStatus, WorkPackageRow[]>;
  const db = getDb();
  if (!db) return empty;
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    package_code: string;
    name: string;
    project_id: string;
    project_code: string | null;
    project_slug: string | null;
    status: string;
    progress_percentage: string;
    responsible_name: string | null;
    vendor_name: string | null;
    budget_minor: string | null;
    actual_minor: string | null;
    planned_finish: string | null;
  }>(sql`
    SELECT w.id::text                                  AS id,
           w.package_code                                AS package_code,
           w.name                                        AS name,
           w.project_id::text                            AS project_id,
           p.project_code                                AS project_code,
           p.slug                                        AS project_slug,
           w.status                                      AS status,
           w.progress_percentage::text                   AS progress_percentage,
           u.full_name                                   AS responsible_name,
           v.legal_name                                  AS vendor_name,
           w.budget_amount_minor::text                   AS budget_minor,
           w.actual_amount_minor::text                   AS actual_minor,
           w.planned_finish::text                        AS planned_finish
      FROM work_packages w
      LEFT JOIN projects p ON p.id = w.project_id
      LEFT JOIN app_users u ON u.id = w.responsible_user_id
      LEFT JOIN vendors v   ON v.id = w.primary_vendor_id
     WHERE w.organization_id = ${orgId}
     ORDER BY w.display_order, w.package_code
     LIMIT 60
  `);
  const result: Record<WpStatus, WorkPackageRow[]> = {
    planned: [],
    ready_to_start: [],
    in_progress: [],
    completed: [],
    on_hold: [],
    cancelled: [],
  };
  for (const r of rowsOf<{
    id: string;
    package_code: string;
    name: string;
    project_id: string;
    project_code: string | null;
    project_slug: string | null;
    status: string;
    progress_percentage: string;
    responsible_name: string | null;
    vendor_name: string | null;
    budget_minor: string | null;
    actual_minor: string | null;
    planned_finish: string | null;
  }>(rows)) {
    const status = (r.status as WpStatus) ?? "planned";
    if (!(status in result)) continue;
    result[status].push({
      id: r.id,
      packageCode: r.package_code,
      name: r.name,
      projectId: r.project_id,
      projectCode: r.project_code,
      projectSlug: r.project_slug,
      status,
      progressPercentage: Number(r.progress_percentage),
      responsibleUserName: r.responsible_name,
      primaryVendorName: r.vendor_name,
      budgetMinor: r.budget_minor !== null ? Number(r.budget_minor) : null,
      actualMinor: r.actual_minor !== null ? Number(r.actual_minor) : null,
      plannedFinish: r.planned_finish,
    });
  }
  return result;
}

export interface AtRiskRow {
  id: string;
  packageCode: string;
  name: string;
  projectCode: string | null;
  daysOverdue: number;
  responsibleUserName: string | null;
}

/** WPs where planned_finish < CURRENT_DATE and status ≠ completed. */
export async function listAtRiskPackages(limit = 5): Promise<AtRiskRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    package_code: string;
    name: string;
    project_code: string | null;
    days_overdue: string;
    responsible_name: string | null;
  }>(sql`
    SELECT w.id::text                                                 AS id,
           w.package_code                                              AS package_code,
           w.name                                                      AS name,
           p.project_code                                              AS project_code,
           (CURRENT_DATE - w.planned_finish)::text                     AS days_overdue,
           u.full_name                                                 AS responsible_name
      FROM work_packages w
      LEFT JOIN projects p ON p.id = w.project_id
      LEFT JOIN app_users u ON u.id = w.responsible_user_id
     WHERE w.organization_id = ${orgId}
       AND w.planned_finish IS NOT NULL
       AND w.planned_finish < CURRENT_DATE
       AND w.status NOT IN ('completed','cancelled')
     ORDER BY w.planned_finish ASC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    package_code: string;
    name: string;
    project_code: string | null;
    days_overdue: string;
    responsible_name: string | null;
  }>(rows).map((r) => ({
    id: r.id,
    packageCode: r.package_code,
    name: r.name,
    projectCode: r.project_code,
    daysOverdue: Number(r.days_overdue),
    responsibleUserName: r.responsible_name,
  }));
}

export interface DailyDigestRow {
  outputCode: string;
  title: string;
  summary: string;
  createdAt: string;
}

// =============================================================================
// Sprint TASK-7-DATA-PART-3 — 7-day schedule strip for PM cabinet.
// =============================================================================

export interface ScheduleTaskRow {
  taskId: string;
  taskCode: string;
  name: string;
  workPackageName: string | null;
  projectCode: string | null;
  status: string;
  progressPercentage: number;
  responsibleUserName: string | null;
}

export interface ScheduleDayBucket {
  isoDate: string;
  dayLabel: string;
  tasks: ScheduleTaskRow[];
}

/** Buckets project_tasks by planned_finish over the next 7 days. */
export async function getSevenDaySchedule(): Promise<ScheduleDayBucket[]> {
  const db = getDb();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const buckets: ScheduleDayBucket[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() + i * 86400000);
    return {
      isoDate: d.toISOString().slice(0, 10),
      dayLabel: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
      tasks: [],
    };
  });
  if (!db) return buckets;
  const orgId = await requireOrgId();
  const startIso = buckets[0].isoDate;
  const endIso = buckets[6].isoDate;
  const rows = await db.execute<{
    task_id: string;
    task_code: string;
    name: string;
    planned_finish: string;
    status: string;
    progress: string;
    wp_name: string | null;
    project_code: string | null;
    responsible_name: string | null;
  }>(sql`
    SELECT t.id::text                          AS task_id,
           t.task_code                          AS task_code,
           t.name                               AS name,
           t.planned_finish::text               AS planned_finish,
           t.status                             AS status,
           t.progress_percentage::text          AS progress,
           w.name                               AS wp_name,
           p.project_code                       AS project_code,
           u.full_name                          AS responsible_name
      FROM project_tasks t
      LEFT JOIN work_packages w ON w.id = t.work_package_id
      LEFT JOIN projects p ON p.id = w.project_id
      LEFT JOIN app_users u ON u.id = t.responsible_user_id
     WHERE t.organization_id = ${orgId}
       AND t.planned_finish BETWEEN ${startIso}::date AND ${endIso}::date
     ORDER BY t.planned_finish ASC, t.task_code ASC
     LIMIT 40
  `);
  const byDate = new Map<string, ScheduleDayBucket>();
  for (const b of buckets) byDate.set(b.isoDate, b);
  for (const r of rowsOf<{
    task_id: string;
    task_code: string;
    name: string;
    planned_finish: string;
    status: string;
    progress: string;
    wp_name: string | null;
    project_code: string | null;
    responsible_name: string | null;
  }>(rows)) {
    const bucket = byDate.get(r.planned_finish);
    if (!bucket) continue;
    bucket.tasks.push({
      taskId: r.task_id,
      taskCode: r.task_code,
      name: r.name.replace(/^\[DEMO2\] /, ""),
      workPackageName: r.wp_name?.replace(/^\[DEMO2\] /, "") ?? null,
      projectCode: r.project_code,
      status: r.status,
      progressPercentage: Number(r.progress || 0),
      responsibleUserName: r.responsible_name,
    });
  }
  return buckets;
}

export async function getLatestDailyDigest(): Promise<DailyDigestRow | null> {
  const db = getDb();
  if (!db) return null;
  // TENANT-1: scope to the caller's org so the digest is the org's latest,
  // not the global latest across all tenants.
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    output_code: string;
    title: string;
    summary: string;
    created_at: string;
  }>(sql`
    SELECT output_code, title, summary, created_at::text
      FROM agent_outputs
     WHERE agent_key = 'daily_digest'
       AND organization_id = ${orgId}
     ORDER BY created_at DESC LIMIT 1
  `);
  const r = rowsOf<{
    output_code: string;
    title: string;
    summary: string;
    created_at: string;
  }>(rows)[0];
  return r
    ? {
        outputCode: r.output_code,
        title: r.title,
        summary: r.summary,
        createdAt: r.created_at,
      }
    : null;
}

// =============================================================================
// DAILY-DIGEST-SPRINT-1 P3 — date-scoped milestone changes for the Daily Digest
// agent.
// =============================================================================

export interface DigestMilestoneChangesForDate {
  date: string;
  workPackagesCompletedCount: number;
  workPackagesStartedCount: number;
  phasesEnteredCount: number;
  phasesCompletedCount: number;
  topChanges: Array<{
    kind: "wp_completed" | "wp_started" | "phase_ended" | "phase_started";
    name: string;
    projectId: string;
  }>;
}

export async function getMilestoneChangesForDate(input: {
  orgId: string;
  date: string;
}): Promise<DigestMilestoneChangesForDate> {
  const db = getDb();
  if (!db) {
    return {
      date: input.date,
      workPackagesCompletedCount: 0,
      workPackagesStartedCount: 0,
      phasesEnteredCount: 0,
      phasesCompletedCount: 0,
      topChanges: [],
    };
  }

  const aggRows = await db.execute<{
    wp_completed: string;
    wp_started: string;
    phase_started: string;
    phase_completed: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM work_packages
        WHERE organization_id = ${input.orgId}::uuid
          AND actual_finish::date = ${input.date}::date
          AND status = 'completed') AS wp_completed,
      (SELECT COUNT(*)::text FROM work_packages
        WHERE organization_id = ${input.orgId}::uuid
          AND status = 'in_progress'
          AND updated_at::date = ${input.date}::date) AS wp_started,
      (SELECT COUNT(*)::text FROM project_phases
        WHERE organization_id = ${input.orgId}::uuid
          AND actual_start_date = ${input.date}::date) AS phase_started,
      (SELECT COUNT(*)::text FROM project_phases
        WHERE organization_id = ${input.orgId}::uuid
          AND actual_end_date = ${input.date}::date) AS phase_completed
  `);
  const agg = rowsOf<{
    wp_completed: string;
    wp_started: string;
    phase_started: string;
    phase_completed: string;
  }>(aggRows)[0];

  // Top changes — union of the 4 categories, capped at 6 total.
  const topRows = await db.execute<{
    kind: string;
    name: string;
    project_id: string;
  }>(sql`
    (SELECT 'wp_completed'::text AS kind,
            name                  AS name,
            project_id::text      AS project_id
       FROM work_packages
      WHERE organization_id = ${input.orgId}::uuid
        AND actual_finish::date = ${input.date}::date
        AND status = 'completed'
      LIMIT 3)
    UNION ALL
    (SELECT 'phase_ended'::text AS kind,
            'Phase ended'        AS name,
            project_id::text     AS project_id
       FROM project_phases
      WHERE organization_id = ${input.orgId}::uuid
        AND actual_end_date = ${input.date}::date
      LIMIT 3)
    UNION ALL
    (SELECT 'phase_started'::text AS kind,
            'Phase started'       AS name,
            project_id::text      AS project_id
       FROM project_phases
      WHERE organization_id = ${input.orgId}::uuid
        AND actual_start_date = ${input.date}::date
      LIMIT 3)
  `);
  const topChanges = rowsOf<{
    kind: string;
    name: string;
    project_id: string;
  }>(topRows).slice(0, 6).map((r) => ({
    kind: r.kind as "wp_completed" | "wp_started" | "phase_ended" | "phase_started",
    name: r.name.replace(/^\[DEMO2\] /, ""),
    projectId: r.project_id,
  }));

  return {
    date: input.date,
    workPackagesCompletedCount: Number(agg?.wp_completed ?? "0"),
    workPackagesStartedCount: Number(agg?.wp_started ?? "0"),
    phasesEnteredCount: Number(agg?.phase_started ?? "0"),
    phasesCompletedCount: Number(agg?.phase_completed ?? "0"),
    topChanges,
  };
}
