import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * UNIT build-workspace-roleviews — workspace project-drill reads.
 *
 * The `/development-os/workspace/project/[id]` route is a workspace-scoped
 * rollup of a SINGLE project: the same KPI + attention pattern the
 * command-center landing uses, but filtered to one project. It is NOT a
 * duplicate of the full project detail at
 * `/development-os/projects/[slug]` (14 tabs of land / units / capital /
 * finance / sales / site-ops); the drill links OUT to that page for the
 * deep dive and only carries the workspace lens.
 *
 * Every read is org-scoped via `requireOrgId()` (TENANT-1) AND filtered
 * to the project id, with a `getDb()` null-guard for the demo / no-DB
 * surface. Reads only — no writes, so no audit-log entries.
 */

export interface WorkspaceProjectHeader {
  projectId: string;
  slug: string;
  projectCode: string | null;
  name: string;
  status: string;
  managementStatus: string;
}

/**
 * Resolve a project by id, scoped to the caller's org. Returns null when
 * the id is unknown or belongs to another tenant (drives `notFound()`).
 * The `slug` lets the drill link to the full project detail page.
 */
export async function getWorkspaceProjectHeader(
  projectId: string,
): Promise<WorkspaceProjectHeader | null> {
  const db = getDb();
  if (!db) return null;
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    slug: string;
    project_code: string | null;
    name: string;
    status: string;
    management_status: string;
  }>(sql`
    SELECT p.id::text          AS id,
           p.slug              AS slug,
           p.project_code      AS project_code,
           p.name              AS name,
           p.status            AS status,
           p.management_status AS management_status
      FROM projects p
     WHERE p.organization_id = ${orgId}
       AND p.id = ${projectId}
     LIMIT 1
  `);
  const r = rowsOf<{
    id: string;
    slug: string;
    project_code: string | null;
    name: string;
    status: string;
    management_status: string;
  }>(rows)[0];
  return r
    ? {
        projectId: r.id,
        slug: r.slug,
        projectCode: r.project_code,
        name: r.name?.replace(/^\[DEMO\] /, "") ?? r.name,
        status: r.status,
        managementStatus: r.management_status,
      }
    : null;
}

export interface WorkspaceProjectKpis {
  villas: number;
  openRisks: number;
  openWorkPackages: number;
  recentSiteReports: number;
  bookingsThisMonth: number;
}

/** Portfolio-style KPIs scoped to one project (same shape/spirit as the
 *  landing's `getDevPortfolioKpis`, narrowed by project id). */
export async function getWorkspaceProjectKpis(
  projectId: string,
): Promise<WorkspaceProjectKpis> {
  const empty: WorkspaceProjectKpis = {
    villas: 0,
    openRisks: 0,
    openWorkPackages: 0,
    recentSiteReports: 0,
    bookingsThisMonth: 0,
  };
  const db = getDb();
  if (!db) return empty;
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    villas: string;
    open_risks: string;
    open_wps: string;
    recent_reports: string;
    bookings_mtd: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM villas v
        WHERE v.project_id = ${projectId}
          AND v.status NOT IN ('archived','out_of_service')) AS villas,
      (SELECT COUNT(*)::text FROM project_risks
        WHERE organization_id = ${orgId}
          AND project_id = ${projectId}
          AND mitigation_status NOT IN ('closed_resolved','closed_realized')) AS open_risks,
      (SELECT COUNT(*)::text FROM work_packages
        WHERE organization_id = ${orgId}
          AND project_id = ${projectId}
          AND status IN ('planned','ready_to_start','in_progress')) AS open_wps,
      (SELECT COUNT(*)::text FROM site_reports
        WHERE organization_id = ${orgId}
          AND project_id = ${projectId}
          AND report_date >= (CURRENT_DATE - INTERVAL '14 days')) AS recent_reports,
      COALESCE((SELECT COUNT(*)::text FROM bookings b
         JOIN villas v ON v.id = b.villa_id
        WHERE v.project_id = ${projectId}
          AND b.check_in >= date_trunc('month', CURRENT_DATE)::date
          AND b.status IN ('confirmed','checked_in','checked_out')), '0') AS bookings_mtd
  `);
  const r = rowsOf<{
    villas: string;
    open_risks: string;
    open_wps: string;
    recent_reports: string;
    bookings_mtd: string;
  }>(rows)[0];
  if (!r) return empty;
  return {
    villas: Number(r.villas ?? "0"),
    openRisks: Number(r.open_risks ?? "0"),
    openWorkPackages: Number(r.open_wps ?? "0"),
    recentSiteReports: Number(r.recent_reports ?? "0"),
    bookingsThisMonth: Number(r.bookings_mtd ?? "0"),
  };
}

export interface WorkspaceProjectRisk {
  riskId: string;
  riskCode: string;
  title: string;
  category: string;
  probability: string;
  impact: string;
  riskScore: number;
}

/** Open risks for a single project (drives the scoped attention feed). */
export async function getWorkspaceProjectRisks(
  projectId: string,
  limit = 6,
): Promise<WorkspaceProjectRisk[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    risk_code: string;
    title: string;
    category: string;
    probability: string;
    impact: string;
    risk_score: string;
  }>(sql`
    SELECT r.id::text        AS id,
           r.risk_code       AS risk_code,
           r.title           AS title,
           r.category        AS category,
           r.probability     AS probability,
           r.impact          AS impact,
           r.risk_score::text AS risk_score
      FROM project_risks r
     WHERE r.organization_id = ${orgId}
       AND r.project_id = ${projectId}
       AND r.mitigation_status NOT IN ('closed_resolved','closed_realized')
     ORDER BY r.risk_score DESC NULLS LAST, r.identified_at DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    risk_code: string;
    title: string;
    category: string;
    probability: string;
    impact: string;
    risk_score: string;
  }>(rows).map((r) => ({
    riskId: r.id,
    riskCode: r.risk_code,
    title: r.title.replace(/^\[DEMO2\] /, ""),
    category: r.category,
    probability: r.probability,
    impact: r.impact,
    riskScore: Number(r.risk_score || 0),
  }));
}

export interface WorkspaceProjectSiteRow {
  occurredAt: string;
  summary: string;
  authorName: string | null;
  workersPresent: number;
}

/** Recent site reports for a single project (scoped activity feed). */
export async function getWorkspaceProjectSiteActivity(
  projectId: string,
  limit = 6,
): Promise<WorkspaceProjectSiteRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    report_date: string;
    summary: string | null;
    reporter_name: string | null;
    workers: string;
  }>(sql`
    SELECT sr.report_date::text          AS report_date,
           sr.summary                     AS summary,
           u.full_name                    AS reporter_name,
           sr.total_workers_present::text AS workers
      FROM site_reports sr
      LEFT JOIN app_users u ON u.id = sr.reported_by
     WHERE sr.organization_id = ${orgId}
       AND sr.project_id = ${projectId}
     ORDER BY sr.report_date DESC, sr.created_at DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    report_date: string;
    summary: string | null;
    reporter_name: string | null;
    workers: string;
  }>(rows).map((r) => ({
    occurredAt: r.report_date,
    summary: r.summary?.replace(/^\[DEMO2\] /, "") ?? "Site report filed",
    authorName: r.reporter_name,
    workersPresent: Number(r.workers || 0),
  }));
}
