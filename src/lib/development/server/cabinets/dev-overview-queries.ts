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
