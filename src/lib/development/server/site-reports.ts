import "server-only";

import { and, eq, sql, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  siteReports,
  siteReportZones,
  siteReportPhotos,
  siteWorkforceLogs,
  siteZones,
} from "@/lib/db/schema/site-operations";
import type {
  ReportStatus,
  SourceChannel,
  WeatherCondition,
  WorkforceRole,
  ZoneType,
} from "@/lib/development/constants/site-constants";

const toNum = (v: unknown): number =>
  v === null || v === undefined ? 0 : Number(v);

// ---------------------------------------------------------------------------
// Site zones
// ---------------------------------------------------------------------------

export interface SiteZoneListItem {
  id: string;
  projectId: string;
  zoneCode: string;
  zoneName: string;
  zoneType: ZoneType;
  villaId: string | null;
  expectedStartDate: string | null;
  expectedCompletionDate: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
  isActive: boolean;
  displayOrder: number;
}

export async function getSiteZones(projectId: string): Promise<SiteZoneListItem[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(siteZones)
    .where(
      and(
        eq(siteZones.projectId, projectId),
        eq(siteZones.organizationId, organizationId),
      ),
    )
    .orderBy(siteZones.displayOrder, siteZones.zoneCode);
  return rows.map((z) => ({
    id: z.id,
    projectId: z.projectId,
    zoneCode: z.zoneCode,
    zoneName: z.zoneName,
    zoneType: z.zoneType as ZoneType,
    villaId: z.villaId ?? null,
    expectedStartDate: z.expectedStartDate
      ? String(z.expectedStartDate)
      : null,
    expectedCompletionDate: z.expectedCompletionDate
      ? String(z.expectedCompletionDate)
      : null,
    actualStartDate: z.actualStartDate ? String(z.actualStartDate) : null,
    actualCompletionDate: z.actualCompletionDate
      ? String(z.actualCompletionDate)
      : null,
    isActive: z.isActive,
    displayOrder: z.displayOrder,
  }));
}

export async function getSiteZone(id: string): Promise<SiteZoneListItem | null> {
  const db = getDb();
  if (!db) return null;
  const [z] = await db
    .select()
    .from(siteZones)
    .where(eq(siteZones.id, id))
    .limit(1);
  if (!z) return null;
  return {
    id: z.id,
    projectId: z.projectId,
    zoneCode: z.zoneCode,
    zoneName: z.zoneName,
    zoneType: z.zoneType as ZoneType,
    villaId: z.villaId ?? null,
    expectedStartDate: z.expectedStartDate ? String(z.expectedStartDate) : null,
    expectedCompletionDate: z.expectedCompletionDate
      ? String(z.expectedCompletionDate)
      : null,
    actualStartDate: z.actualStartDate ? String(z.actualStartDate) : null,
    actualCompletionDate: z.actualCompletionDate
      ? String(z.actualCompletionDate)
      : null,
    isActive: z.isActive,
    displayOrder: z.displayOrder,
  };
}

// ---------------------------------------------------------------------------
// Site reports
// ---------------------------------------------------------------------------

export interface SiteReportListItem {
  id: string;
  projectId: string;
  projectName: string | null;
  reportDate: string;
  weatherConditions: WeatherCondition | null;
  totalWorkersPresent: number;
  totalWorkersPlanned: number | null;
  status: ReportStatus;
  sourceChannel: SourceChannel;
  submittedAt: string | null;
  reviewedAt: string | null;
  zoneCount: number;
  photoCount: number;
  blockerCount: number;
}

export interface SiteReportFilters {
  projectId?: string;
  status?: ReportStatus;
  fromDate?: string;
  toDate?: string;
  hasBlocker?: boolean;
}

export async function getSiteReports(
  filters: SiteReportFilters = {},
): Promise<SiteReportListItem[]> {
  const db = getDb();
  if (!db) return [];

  const organizationId = await requireOrgId();
  const conditions: ReturnType<typeof sql>[] = [];
  // TENANT: site_reports.organization_id is NOT NULL — always scope,
  // including the no-projectId list branch which was previously global.
  conditions.push(sql`r.organization_id = ${organizationId}`);
  if (filters.projectId)
    conditions.push(sql`r.project_id = ${filters.projectId}`);
  if (filters.status) conditions.push(sql`r.status = ${filters.status}`);
  if (filters.fromDate) conditions.push(sql`r.report_date >= ${filters.fromDate}`);
  if (filters.toDate) conditions.push(sql`r.report_date <= ${filters.toDate}`);
  if (filters.hasBlocker)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM site_report_zones z
        WHERE z.site_report_id = r.id AND z.has_blocker = true)`,
    );
  const where = conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      r.id, r.project_id, p.name AS project_name, r.report_date,
      r.weather_conditions, r.total_workers_present, r.total_workers_planned,
      r.status, r.source_channel, r.submitted_at, r.reviewed_at,
      coalesce(z.zone_count, 0)::int AS zone_count,
      coalesce(ph.photo_count, 0)::int AS photo_count,
      coalesce(bl.blocker_count, 0)::int AS blocker_count
    FROM site_reports r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN (
      SELECT site_report_id, count(*)::int AS zone_count
      FROM site_report_zones GROUP BY site_report_id
    ) z ON z.site_report_id = r.id
    LEFT JOIN (
      SELECT site_report_id, count(*)::int AS photo_count
      FROM site_report_photos GROUP BY site_report_id
    ) ph ON ph.site_report_id = r.id
    LEFT JOIN (
      SELECT site_report_id, count(*)::int AS blocker_count
      FROM site_report_zones WHERE has_blocker = true GROUP BY site_report_id
    ) bl ON bl.site_report_id = r.id
    ${where}
    ORDER BY r.report_date DESC, r.created_at DESC
    LIMIT 200
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    projectName: r.project_name ? String(r.project_name) : null,
    reportDate: String(r.report_date),
    weatherConditions: r.weather_conditions
      ? (String(r.weather_conditions) as WeatherCondition)
      : null,
    totalWorkersPresent: toNum(r.total_workers_present),
    totalWorkersPlanned: r.total_workers_planned
      ? toNum(r.total_workers_planned)
      : null,
    status: String(r.status) as ReportStatus,
    sourceChannel: String(r.source_channel) as SourceChannel,
    submittedAt: r.submitted_at
      ? new Date(r.submitted_at as string).toISOString()
      : null,
    reviewedAt: r.reviewed_at
      ? new Date(r.reviewed_at as string).toISOString()
      : null,
    zoneCount: toNum(r.zone_count),
    photoCount: toNum(r.photo_count),
    blockerCount: toNum(r.blocker_count),
  }));
}

export interface SiteReportDetail extends SiteReportListItem {
  weatherNotes: string | null;
  temperatureCelsiusMin: number | null;
  temperatureCelsiusMax: number | null;
  summary: string | null;
  reportedBy: string | null;
  reporterRole: string | null;
  reviewerNotes: string | null;
  notes: string | null;
  zones: Array<{
    id: string;
    zoneId: string;
    zoneCode: string;
    zoneName: string;
    activitiesCompleted: string[];
    activitiesPlannedTomorrow: string[];
    workersInZone: number;
    progressPercentToday: string | null;
    cumulativeProgressPercent: string | null;
    hasBlocker: boolean;
    blockerDescription: string | null;
  }>;
  photos: Array<{
    id: string;
    documentId: string;
    zoneId: string | null;
    caption: string | null;
    photoTakenAt: string;
    aiAnalyzedAt: string | null;
  }>;
  workforce: Array<{
    id: string;
    roleCategory: WorkforceRole;
    workerCount: number;
    hoursPerWorker: string;
    totalManHours: string | null;
    estimatedCostUsdMinor: string | null;
  }>;
}

export async function getSiteReport(id: string): Promise<SiteReportDetail | null> {
  const db = getDb();
  if (!db) return null;

  const organizationId = await requireOrgId();

  // Org-scoped base SELECT — a cross-tenant id resolves to no row, so the
  // page notFound()s rather than leaking another org's report.
  const [base] = await db
    .select()
    .from(siteReports)
    .where(
      and(
        eq(siteReports.id, id),
        eq(siteReports.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!base) return null;

  // Derive the list-shaped summary from an org+project-scoped query (not
  // the unfiltered global list) so the aggregate counts are tenant-safe.
  const list = await getSiteReports({ projectId: base.projectId });
  const summary = list.find((r) => r.id === id);
  if (!summary) return null;

  const zoneRows = await db
    .select({
      id: siteReportZones.id,
      zoneId: siteReportZones.zoneId,
      activitiesCompleted: siteReportZones.activitiesCompleted,
      activitiesPlannedTomorrow: siteReportZones.activitiesPlannedTomorrow,
      workersInZone: siteReportZones.workersInZone,
      progressPercentToday: siteReportZones.progressPercentToday,
      cumulativeProgressPercent: siteReportZones.cumulativeProgressPercent,
      hasBlocker: siteReportZones.hasBlocker,
      blockerDescription: siteReportZones.blockerDescription,
      zoneCode: siteZones.zoneCode,
      zoneName: siteZones.zoneName,
    })
    .from(siteReportZones)
    .innerJoin(siteZones, eq(siteZones.id, siteReportZones.zoneId))
    .where(eq(siteReportZones.siteReportId, id));

  const photos = await db
    .select()
    .from(siteReportPhotos)
    .where(eq(siteReportPhotos.siteReportId, id))
    .orderBy(desc(siteReportPhotos.photoTakenAt));

  const workforce = await db
    .select()
    .from(siteWorkforceLogs)
    .where(eq(siteWorkforceLogs.siteReportId, id));

  return {
    ...summary,
    weatherNotes: base.weatherNotes ?? null,
    temperatureCelsiusMin: base.temperatureCelsiusMin ?? null,
    temperatureCelsiusMax: base.temperatureCelsiusMax ?? null,
    summary: base.summary ?? null,
    reportedBy: base.reportedBy ?? null,
    reporterRole: base.reporterRole ?? null,
    reviewerNotes: base.reviewerNotes ?? null,
    notes: base.notes ?? null,
    zones: zoneRows.map((z) => ({
      id: z.id,
      zoneId: z.zoneId,
      zoneCode: z.zoneCode,
      zoneName: z.zoneName,
      activitiesCompleted: z.activitiesCompleted ?? [],
      activitiesPlannedTomorrow: z.activitiesPlannedTomorrow ?? [],
      workersInZone: z.workersInZone,
      progressPercentToday: z.progressPercentToday
        ? String(z.progressPercentToday)
        : null,
      cumulativeProgressPercent: z.cumulativeProgressPercent
        ? String(z.cumulativeProgressPercent)
        : null,
      hasBlocker: z.hasBlocker,
      blockerDescription: z.blockerDescription ?? null,
    })),
    photos: photos.map((p) => ({
      id: p.id,
      documentId: p.documentId,
      zoneId: p.zoneId ?? null,
      caption: p.caption ?? null,
      photoTakenAt: new Date(p.photoTakenAt).toISOString(),
      aiAnalyzedAt: p.aiAnalyzedAt
        ? new Date(p.aiAnalyzedAt).toISOString()
        : null,
    })),
    workforce: workforce.map((w) => ({
      id: w.id,
      roleCategory: w.roleCategory as WorkforceRole,
      workerCount: w.workerCount,
      hoursPerWorker: String(w.hoursPerWorker),
      totalManHours: w.totalManHours ? String(w.totalManHours) : null,
      estimatedCostUsdMinor: w.estimatedCostUsdMinor
        ? String(w.estimatedCostUsdMinor)
        : null,
    })),
  };
}

export async function getSiteReportToday(
  projectId: string,
): Promise<SiteReportListItem | null> {
  const today = new Date().toISOString().slice(0, 10);
  const list = await getSiteReports({
    projectId,
    fromDate: today,
    toDate: today,
  });
  return list[0] ?? null;
}

export interface SiteReportMetrics {
  totalReports: number;
  avgWorkersPerDay: number;
  totalManHours: number;
  blockersCount: number;
  photosCount: number;
}

export async function getSiteReportMetrics(
  projectId: string,
  fromDate?: string,
  toDate?: string,
): Promise<SiteReportMetrics> {
  const db = getDb();
  if (!db) {
    return {
      totalReports: 0,
      avgWorkersPerDay: 0,
      totalManHours: 0,
      blockersCount: 0,
      photosCount: 0,
    };
  }
  const fromClause = fromDate ? sql`AND r.report_date >= ${fromDate}` : sql``;
  const toClause = toDate ? sql`AND r.report_date <= ${toDate}` : sql``;
  const [row] = await db.execute(sql`
    SELECT
      count(DISTINCT r.id)::int AS total_reports,
      coalesce(avg(r.total_workers_present), 0)::numeric AS avg_workers,
      coalesce(sum(w.total_man_hours), 0)::numeric AS total_man_hours,
      coalesce((SELECT count(*) FROM site_report_zones z
        WHERE z.has_blocker = true AND z.site_report_id IN (
          SELECT id FROM site_reports WHERE project_id = ${projectId}
            ${fromClause} ${toClause})), 0)::int AS blocker_count,
      coalesce((SELECT count(*) FROM site_report_photos p
        WHERE p.site_report_id IN (
          SELECT id FROM site_reports WHERE project_id = ${projectId}
            ${fromClause} ${toClause})), 0)::int AS photo_count
    FROM site_reports r
    LEFT JOIN site_workforce_logs w ON w.site_report_id = r.id
    WHERE r.project_id = ${projectId}
      ${fromClause} ${toClause}
  `);
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    totalReports: toNum(r.total_reports),
    avgWorkersPerDay: Number(r.avg_workers ?? 0),
    totalManHours: Number(r.total_man_hours ?? 0),
    blockersCount: toNum(r.blocker_count),
    photosCount: toNum(r.photo_count),
  };
}
