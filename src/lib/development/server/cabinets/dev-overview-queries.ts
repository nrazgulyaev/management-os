import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Sprint TASK-7-DATA-PART-2 — Dev OS Overview / Command Center queries.
 *
 * The `/development-os/page.tsx` cabinet needs three reads: projects
 * rollup, team roster, and the latest qs-cost-analyst agent run for
 * the AI band. All org-scoped via requireOrgId() (TENANT-1).
 */

export interface OverviewProjectRow {
  projectId: string;
  projectCode: string;
  name: string;
  status: string;
  managementStatus: string;
  villaCount: number;
}

export async function getActiveProjectsRollup(): Promise<OverviewProjectRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    project_code: string;
    name: string;
    status: string;
    management_status: string;
    villa_count: string;
  }>(sql`
    SELECT p.id::text                                AS id,
           p.project_code                             AS project_code,
           p.name                                     AS name,
           p.status                                   AS status,
           p.management_status                        AS management_status,
           COUNT(v.id)::text                          AS villa_count
      FROM projects p
      LEFT JOIN villas v ON v.project_id = p.id
     WHERE p.organization_id = ${orgId}
       AND p.status IN ('active','planning','under_construction','managed')
     GROUP BY p.id, p.project_code, p.name, p.status, p.management_status
     ORDER BY p.project_code
     LIMIT 12
  `);
  return (
    (rows as unknown as { rows: Array<{
      id: string;
      project_code: string;
      name: string;
      status: string;
      management_status: string;
      villa_count: string;
    }> }).rows ?? []
  ).map((r) => ({
    projectId: r.id,
    projectCode: r.project_code,
    name: r.name,
    status: r.status,
    managementStatus: r.management_status,
    villaCount: Number(r.villa_count),
  }));
}

export interface TeamRosterRow {
  userId: string;
  fullName: string;
  email: string;
  initials: string;
  primaryRole: string | null;
}

export async function getTeamRoster(): Promise<TeamRosterRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    full_name: string;
    email: string;
    role_key: string | null;
  }>(sql`
    SELECT u.id::text                                AS id,
           u.full_name                                AS full_name,
           u.email                                    AS email,
           MIN(r.key)                                 AS role_key
      FROM app_users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles      r  ON r.id = ur.role_id
     WHERE u.organization_id = ${orgId}
       AND u.status = 'active'
     GROUP BY u.id, u.full_name, u.email
     ORDER BY u.full_name
     LIMIT 12
  `);
  return (
    (rows as unknown as { rows: Array<{
      id: string;
      full_name: string;
      email: string;
      role_key: string | null;
    }> }).rows ?? []
  ).map((r) => ({
    userId: r.id,
    fullName: r.full_name,
    email: r.email,
    initials: r.full_name
      .split(/\s+/)
      .filter((p) => p && /[A-Za-z]/.test(p[0]))
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    primaryRole: r.role_key,
  }));
}

export interface LatestAnomalyRow {
  outputCode: string;
  title: string;
  summary: string;
  createdAt: string;
}

// =============================================================================
// Sprint TASK-7-DATA-PART-3 — risk radar + site activity feed + portfolio KPIs.
// =============================================================================

export interface RiskRadarRow {
  riskId: string;
  riskCode: string;
  title: string;
  projectName: string | null;
  projectCode: string | null;
  category: string;
  probability: string;
  impact: string;
  riskScore: number;
  mitigationStatus: string;
  ownerName: string | null;
}

export async function getRiskRadar(limit = 5): Promise<RiskRadarRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    risk_code: string;
    title: string;
    project_name: string | null;
    project_code: string | null;
    category: string;
    probability: string;
    impact: string;
    risk_score: string;
    mitigation_status: string;
    owner_name: string | null;
  }>(sql`
    SELECT r.id::text             AS id,
           r.risk_code             AS risk_code,
           r.title                 AS title,
           p.name                  AS project_name,
           p.project_code          AS project_code,
           r.category              AS category,
           r.probability           AS probability,
           r.impact                AS impact,
           r.risk_score::text      AS risk_score,
           r.mitigation_status     AS mitigation_status,
           u.full_name             AS owner_name
      FROM project_risks r
      LEFT JOIN projects p ON p.id = r.project_id
      LEFT JOIN app_users u ON u.id = r.owner_id
     WHERE r.organization_id = ${orgId}
       AND r.mitigation_status NOT IN ('closed_resolved','closed_realized')
     ORDER BY r.risk_score DESC NULLS LAST, r.identified_at DESC
     LIMIT ${limit}
  `);
  return (
    (rows as unknown as { rows: Array<{
      id: string;
      risk_code: string;
      title: string;
      project_name: string | null;
      project_code: string | null;
      category: string;
      probability: string;
      impact: string;
      risk_score: string;
      mitigation_status: string;
      owner_name: string | null;
    }> }).rows ?? []
  ).map((r) => ({
    riskId: r.id,
    riskCode: r.risk_code,
    title: r.title.replace(/^\[DEMO2\] /, ""),
    projectName: r.project_name?.replace(/^\[DEMO\] /, "") ?? null,
    projectCode: r.project_code,
    category: r.category,
    probability: r.probability,
    impact: r.impact,
    riskScore: Number(r.risk_score || 0),
    mitigationStatus: r.mitigation_status,
    ownerName: r.owner_name,
  }));
}

export interface SiteActivityRow {
  source: "site_report";
  occurredAt: string;
  projectCode: string | null;
  summary: string;
  authorName: string | null;
  workersPresent: number;
}

export async function getSiteActivityFeed(limit = 6): Promise<SiteActivityRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    report_date: string;
    project_code: string | null;
    summary: string | null;
    reporter_name: string | null;
    workers: string;
  }>(sql`
    SELECT sr.report_date::text                AS report_date,
           p.project_code                       AS project_code,
           sr.summary                           AS summary,
           u.full_name                          AS reporter_name,
           sr.total_workers_present::text       AS workers
      FROM site_reports sr
      LEFT JOIN projects p ON p.id = sr.project_id
      LEFT JOIN app_users u ON u.id = sr.reported_by
     WHERE sr.organization_id = ${orgId}
     ORDER BY sr.report_date DESC, sr.created_at DESC
     LIMIT ${limit}
  `);
  return (
    (rows as unknown as { rows: Array<{
      report_date: string;
      project_code: string | null;
      summary: string | null;
      reporter_name: string | null;
      workers: string;
    }> }).rows ?? []
  ).map((r) => ({
    source: "site_report" as const,
    occurredAt: r.report_date,
    projectCode: r.project_code,
    summary: r.summary?.replace(/^\[DEMO2\] /, "") ?? "Site report filed",
    authorName: r.reporter_name,
    workersPresent: Number(r.workers || 0),
  }));
}

export interface PortfolioKpis {
  activeProjects: number;
  activeVillas: number;
  bookingsThisMonth: number;
  openRisks: number;
  openWorkPackages: number;
  recentSiteReports: number;
}

export async function getDevPortfolioKpis(): Promise<PortfolioKpis> {
  const db = getDb();
  if (!db) {
    return {
      activeProjects: 0,
      activeVillas: 0,
      bookingsThisMonth: 0,
      openRisks: 0,
      openWorkPackages: 0,
      recentSiteReports: 0,
    };
  }
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    active_projects: string;
    active_villas: string;
    bookings_mtd: string;
    open_risks: string;
    open_wps: string;
    recent_reports: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM projects
        WHERE organization_id = ${orgId}
          AND status IN ('active','planning','under_construction','managed')) AS active_projects,
      (SELECT COUNT(*)::text FROM villas v
         JOIN projects p ON p.id = v.project_id
        WHERE p.organization_id = ${orgId}
          AND v.status NOT IN ('archived','out_of_service')) AS active_villas,
      COALESCE((SELECT COUNT(*)::text FROM bookings b
         JOIN villas v ON v.id = b.villa_id
         JOIN projects p ON p.id = v.project_id
        WHERE p.organization_id = ${orgId}
          AND b.check_in >= date_trunc('month', CURRENT_DATE)::date
          AND b.status IN ('confirmed','checked_in','checked_out')), '0') AS bookings_mtd,
      (SELECT COUNT(*)::text FROM project_risks
        WHERE organization_id = ${orgId}
          AND mitigation_status NOT IN ('closed_resolved','closed_realized')) AS open_risks,
      (SELECT COUNT(*)::text FROM work_packages
        WHERE organization_id = ${orgId}
          AND status IN ('planned','ready_to_start','in_progress')) AS open_wps,
      (SELECT COUNT(*)::text FROM site_reports
        WHERE organization_id = ${orgId}
          AND report_date >= (CURRENT_DATE - INTERVAL '14 days')) AS recent_reports
  `);
  const r = (rows as unknown as { rows: Array<{
    active_projects: string;
    active_villas: string;
    bookings_mtd: string;
    open_risks: string;
    open_wps: string;
    recent_reports: string;
  }> }).rows?.[0];
  return {
    activeProjects: Number(r?.active_projects ?? "0"),
    activeVillas: Number(r?.active_villas ?? "0"),
    bookingsThisMonth: Number(r?.bookings_mtd ?? "0"),
    openRisks: Number(r?.open_risks ?? "0"),
    openWorkPackages: Number(r?.open_wps ?? "0"),
    recentSiteReports: Number(r?.recent_reports ?? "0"),
  };
}

export async function getLatestQsAnomaly(): Promise<LatestAnomalyRow | null> {
  const db = getDb();
  if (!db) return null;
  // agent_outputs is global (no org_id) — gate by agent_key only.
  const rows = await db.execute<{
    output_code: string;
    title: string;
    summary: string;
    created_at: string;
  }>(sql`
    SELECT output_code, title, summary, created_at::text
      FROM agent_outputs
     WHERE agent_key = 'qs_cost_analyst'
     ORDER BY created_at DESC LIMIT 1
  `);
  const r = (rows as unknown as { rows: Array<{
    output_code: string;
    title: string;
    summary: string;
    created_at: string;
  }> }).rows?.[0];
  return r
    ? {
        outputCode: r.output_code,
        title: r.title,
        summary: r.summary,
        createdAt: r.created_at,
      }
    : null;
}
