import "server-only";

import { eq, sql, and, gte, lte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { safetyIncidents } from "@/lib/db/schema/site-operations";
import { projects } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";
import type {
  SafetyCategory,
  SafetySeverity,
  SafetyStatus,
} from "@/lib/development/constants/safety-constants";

const toNum = (v: unknown): number =>
  v === null || v === undefined ? 0 : Number(v);

export interface SafetyIncidentListItem {
  id: string;
  incidentCode: string;
  projectId: string;
  zoneId: string | null;
  incidentDate: string;
  severity: SafetySeverity;
  category: SafetyCategory;
  affectedWorkersCount: number;
  description: string;
  status: SafetyStatus;
  reportedToAuthorities: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SafetyFilters {
  projectId?: string;
  severity?: SafetySeverity;
  status?: SafetyStatus;
  category?: SafetyCategory;
  fromDate?: string;
  toDate?: string;
}

export async function getSafetyIncidents(
  filters: SafetyFilters = {},
): Promise<SafetyIncidentListItem[]> {
  const db = getDb();
  if (!db) return [];
  // safety_incidents has no organization_id; anchor org via projects.
  const organizationId = await requireOrgId();
  const conditions = [eq(projects.organizationId, organizationId)];
  if (filters.projectId)
    conditions.push(eq(safetyIncidents.projectId, filters.projectId));
  if (filters.severity)
    conditions.push(eq(safetyIncidents.severity, filters.severity));
  if (filters.status) conditions.push(eq(safetyIncidents.status, filters.status));
  if (filters.category)
    conditions.push(eq(safetyIncidents.category, filters.category));
  if (filters.fromDate)
    conditions.push(gte(safetyIncidents.incidentDate, filters.fromDate));
  if (filters.toDate)
    conditions.push(lte(safetyIncidents.incidentDate, filters.toDate));

  const rows = await db
    .select()
    .from(safetyIncidents)
    .innerJoin(projects, eq(projects.id, safetyIncidents.projectId))
    .where(and(...conditions))
    .orderBy(desc(safetyIncidents.incidentDate), desc(safetyIncidents.createdAt));

  return rows.map(({ safety_incidents: i }) => ({
    id: i.id,
    incidentCode: i.incidentCode,
    projectId: i.projectId,
    zoneId: i.zoneId ?? null,
    incidentDate: String(i.incidentDate),
    severity: i.severity as SafetySeverity,
    category: i.category as SafetyCategory,
    affectedWorkersCount: i.affectedWorkersCount,
    description: i.description,
    status: i.status as SafetyStatus,
    reportedToAuthorities: i.reportedToAuthorities,
    resolvedAt: i.resolvedAt ? new Date(i.resolvedAt).toISOString() : null,
    createdAt: new Date(i.createdAt).toISOString(),
  }));
}

export async function getSafetyIncident(
  idOrCode: string,
): Promise<SafetyIncidentListItem | null> {
  const list = await getSafetyIncidents();
  return list.find((i) => i.id === idOrCode || i.incidentCode === idOrCode) ?? null;
}

export async function getOpenSafetyIncidents(): Promise<SafetyIncidentListItem[]> {
  return getSafetyIncidents({ status: "open" });
}

export interface SafetyMetrics {
  totalIncidents: number;
  bySeverity: Record<SafetySeverity, number>;
  byStatus: Record<SafetyStatus, number>;
  openCount: number;
  affectedWorkersTotal: number;
}

export async function getSafetyMetrics(
  projectId?: string,
  fromDate?: string,
  toDate?: string,
): Promise<SafetyMetrics> {
  const db = getDb();
  if (!db) {
    return {
      totalIncidents: 0,
      bySeverity: {
        near_miss: 0,
        minor: 0,
        moderate: 0,
        severe: 0,
        fatal: 0,
      },
      byStatus: { open: 0, under_investigation: 0, resolved: 0, closed: 0 },
      openCount: 0,
      affectedWorkersTotal: 0,
    };
  }
  // safety_incidents has no organization_id; anchor org via projects.
  const organizationId = await requireOrgId();
  const projClause = projectId ? sql`AND project_id = ${projectId}` : sql``;
  const fromClause = fromDate ? sql`AND incident_date >= ${fromDate}` : sql``;
  const toClause = toDate ? sql`AND incident_date <= ${toDate}` : sql``;

  const [r] = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE severity='near_miss')::int AS sev_near_miss,
      count(*) FILTER (WHERE severity='minor')::int AS sev_minor,
      count(*) FILTER (WHERE severity='moderate')::int AS sev_moderate,
      count(*) FILTER (WHERE severity='severe')::int AS sev_severe,
      count(*) FILTER (WHERE severity='fatal')::int AS sev_fatal,
      count(*) FILTER (WHERE status='open')::int AS st_open,
      count(*) FILTER (WHERE status='under_investigation')::int AS st_inv,
      count(*) FILTER (WHERE status='resolved')::int AS st_resolved,
      count(*) FILTER (WHERE status='closed')::int AS st_closed,
      coalesce(sum(affected_workers_count), 0)::int AS affected_total
    FROM safety_incidents
    WHERE project_id IN (
      SELECT id FROM projects WHERE organization_id = ${organizationId}
    ) ${projClause} ${fromClause} ${toClause}
  `);
  const row = (r ?? {}) as Record<string, unknown>;
  return {
    totalIncidents: toNum(row.total),
    bySeverity: {
      near_miss: toNum(row.sev_near_miss),
      minor: toNum(row.sev_minor),
      moderate: toNum(row.sev_moderate),
      severe: toNum(row.sev_severe),
      fatal: toNum(row.sev_fatal),
    },
    byStatus: {
      open: toNum(row.st_open),
      under_investigation: toNum(row.st_inv),
      resolved: toNum(row.st_resolved),
      closed: toNum(row.st_closed),
    },
    openCount: toNum(row.st_open),
    affectedWorkersTotal: toNum(row.affected_total),
  };
}
