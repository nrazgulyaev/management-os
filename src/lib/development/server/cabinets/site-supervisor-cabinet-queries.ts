import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
// SHAPE-FIX-1 / DAILY-DIGEST P0.5 — rowsOf handles postgres-js Array shape.
// TODO(DB-SHAPE-CODEMOD-1): adjacent Dev OS cabinet files still pending sweep.
import { requireOrgId } from "@/features/auth/require-org";

export interface SiteSupervisorCabinetData {
  todaysSiteReportCount: number;
  openQaQcAssignedToMe: number;
  materialsExpectedToday: number;
  yesterdayPhotoCount: number;
  yesterdayWorkforceRecorded: number;
  recentReports: Array<{ id: string; reportDate: string; projectId: string }>;
}

/**
 * Aggregates field-supervisor-relevant data. No new business logic;
 * reads from existing site_reports / qa_qc_issues / material_deliveries.
 */
export async function loadSiteSupervisorCabinet(
  userId: string,
): Promise<SiteSupervisorCabinetData> {
  const db = getDb();
  if (!db) {
    return {
      todaysSiteReportCount: 0,
      openQaQcAssignedToMe: 0,
      materialsExpectedToday: 0,
      yesterdayPhotoCount: 0,
      yesterdayWorkforceRecorded: 0,
      recentReports: [],
    };
  }

  const summary = await db.execute<{
    today_reports: string;
    qaqc_assigned: string;
    materials_today: string;
    yest_photos: string;
    yest_workforce: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM site_reports
        WHERE report_date = CURRENT_DATE) AS today_reports,
      (SELECT COUNT(*)::text FROM qa_qc_issues
        WHERE assigned_to = ${userId}::uuid
          AND status IN ('open', 'in_progress', 'assigned')) AS qaqc_assigned,
      (SELECT COUNT(*)::text FROM material_deliveries
        WHERE expected_delivery_date = CURRENT_DATE) AS materials_today,
      (SELECT COUNT(*)::text FROM site_report_photos srp
         JOIN site_reports sr ON sr.id = srp.site_report_id
        WHERE sr.report_date = CURRENT_DATE - INTERVAL '1 day') AS yest_photos,
      (SELECT COUNT(*)::text FROM site_report_workforce srw
         JOIN site_reports sr ON sr.id = srw.site_report_id
        WHERE sr.report_date = CURRENT_DATE - INTERVAL '1 day') AS yest_workforce
  `);
  const summaryRow = rowsOf<{
    today_reports: string;
    qaqc_assigned: string;
    materials_today: string;
    yest_photos: string;
    yest_workforce: string;
  }>(summary)[0] ?? null;

  const recentRows = await db.execute<{
    id: string;
    report_date: string;
    project_id: string;
  }>(sql`
    SELECT id::text, report_date::text, project_id::text
      FROM site_reports
     WHERE created_by = ${userId}::uuid
     ORDER BY report_date DESC
     LIMIT 5
  `);

  return {
    todaysSiteReportCount: Number(summaryRow?.today_reports ?? "0"),
    openQaQcAssignedToMe: Number(summaryRow?.qaqc_assigned ?? "0"),
    materialsExpectedToday: Number(summaryRow?.materials_today ?? "0"),
    yesterdayPhotoCount: Number(summaryRow?.yest_photos ?? "0"),
    yesterdayWorkforceRecorded: Number(summaryRow?.yest_workforce ?? "0"),
    recentReports: rowsOf<{ id: string; report_date: string; project_id: string }>(
      recentRows,
    ).map((r) => ({
      id: r.id,
      reportDate: r.report_date,
      projectId: r.project_id,
    })),
  };
}

// =============================================================================
// Sprint TASK-7-DATA-PART-2 — Site Supervisor cabinet view readers.
//
// Three reads for the _handoff/ prototype:
//   - listRecentSiteReports()  → daily-report timeline rows
//   - listRecentSitePhotos()   → geo-tagged photo grid
//
// Voice-note panel intentionally stays mock copy this sprint — there
// is no `voice_notes` table yet (DEMO-2 schema work).
//
// Both reads org-scoped via requireOrgId() (TENANT-1). DEMO-1 didn't
// seed site_reports — expect [] in production. Cabinet renders
// friendly empty states.
// =============================================================================

export interface SiteReportRow {
  id: string;
  reportDate: string;
  projectCode: string | null;
  reporterName: string | null;
  reporterRole: string | null;
  summary: string | null;
  weatherConditions: string | null;
  workersPresent: number;
  status: string;
}

export async function listRecentSiteReports(limit = 5): Promise<SiteReportRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    report_date: string;
    project_code: string | null;
    reporter_name: string | null;
    reporter_role: string | null;
    summary: string | null;
    weather: string | null;
    workers: string;
    status: string;
  }>(sql`
    SELECT sr.id::text                                    AS id,
           sr.report_date::text                            AS report_date,
           p.project_code                                  AS project_code,
           u.full_name                                     AS reporter_name,
           sr.reporter_role                                AS reporter_role,
           sr.summary                                      AS summary,
           sr.weather_conditions                           AS weather,
           sr.total_workers_present::text                  AS workers,
           sr.status                                       AS status
      FROM site_reports sr
      LEFT JOIN projects p  ON p.id = sr.project_id
      LEFT JOIN app_users u ON u.id = sr.reported_by
     WHERE sr.organization_id = ${orgId}
     ORDER BY sr.report_date DESC, sr.created_at DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    report_date: string;
    project_code: string | null;
    reporter_name: string | null;
    reporter_role: string | null;
    summary: string | null;
    weather: string | null;
    workers: string;
    status: string;
  }>(rows).map((r) => ({
    id: r.id,
    reportDate: r.report_date,
    projectCode: r.project_code,
    reporterName: r.reporter_name,
    reporterRole: r.reporter_role,
    summary: r.summary,
    weatherConditions: r.weather,
    workersPresent: Number(r.workers),
    status: r.status,
  }));
}

export interface SitePhotoRow {
  id: string;
  reportDate: string;
  projectCode: string | null;
  caption: string | null;
  capturedAt: string;
}

export async function listRecentSitePhotos(limit = 10): Promise<SitePhotoRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    report_date: string;
    project_code: string | null;
    caption: string | null;
    captured_at: string;
  }>(sql`
    SELECT srp.id::text                          AS id,
           sr.report_date::text                   AS report_date,
           p.project_code                          AS project_code,
           srp.caption                             AS caption,
           COALESCE(srp.photo_taken_at::text,
                    srp.created_at::text)         AS captured_at
      FROM site_report_photos srp
      JOIN site_reports sr ON sr.id = srp.site_report_id
      LEFT JOIN projects p ON p.id = sr.project_id
     WHERE srp.organization_id = ${orgId}
     ORDER BY captured_at DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    report_date: string;
    project_code: string | null;
    caption: string | null;
    captured_at: string;
  }>(rows).map((r) => ({
    id: r.id,
    reportDate: r.report_date,
    projectCode: r.project_code,
    caption: r.caption,
    capturedAt: r.captured_at,
  }));
}

// =============================================================================
// Sprint DEMO-3 — Site Supervisor cabinet PART-3 fills.
// Voice notes + QA inspections + safety incidents (schemas + seeds now live).
// =============================================================================

export interface VoiceNoteRow {
  id: string;
  projectCode: string | null;
  reporterName: string | null;
  durationSeconds: number | null;
  transcriptText: string | null;
  transcriptLanguage: string | null;
  createdAt: string;
}

export async function listVoiceNotes(limit = 8): Promise<VoiceNoteRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    project_code: string | null;
    reporter_name: string | null;
    duration_seconds: number | null;
    transcript_text: string | null;
    transcript_language: string | null;
    created_at: string;
  }>(sql`
    SELECT vn.id::text                            AS id,
           p.project_code                          AS project_code,
           u.full_name                             AS reporter_name,
           vn.duration_seconds                     AS duration_seconds,
           vn.transcript_text                      AS transcript_text,
           vn.transcript_language                  AS transcript_language,
           vn.created_at::text                     AS created_at
      FROM voice_notes vn
      LEFT JOIN projects p ON p.id = vn.project_id
      LEFT JOIN app_users u ON u.id = vn.recorded_by
     WHERE vn.organization_id = ${orgId}
     ORDER BY vn.created_at DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    project_code: string | null;
    reporter_name: string | null;
    duration_seconds: number | null;
    transcript_text: string | null;
    transcript_language: string | null;
    created_at: string;
  }>(rows).map((r) => ({
    id: r.id,
    projectCode: r.project_code,
    reporterName: r.reporter_name,
    durationSeconds: r.duration_seconds,
    transcriptText: r.transcript_text,
    transcriptLanguage: r.transcript_language,
    createdAt: r.created_at,
  }));
}

export interface QaInspectionRow {
  id: string;
  issueCode: string;
  issueTitle: string;
  villaCode: string | null;
  inspectionDate: string;
  inspectionNumber: number;
  result: string;
  resultNotes: string | null;
}

export async function listQaInspections(limit = 8): Promise<QaInspectionRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    issue_code: string;
    issue_title: string;
    villa_code: string | null;
    inspection_date: string;
    inspection_number: string;
    result: string;
    result_notes: string | null;
  }>(sql`
    SELECT qi.id::text                          AS id,
           q.issue_code                          AS issue_code,
           q.title                                AS issue_title,
           v.unit_code                            AS villa_code,
           qi.inspection_date::text              AS inspection_date,
           qi.inspection_number::text            AS inspection_number,
           qi.result                              AS result,
           qi.result_notes                        AS result_notes
      FROM qa_qc_inspections qi
      JOIN qa_qc_issues q ON q.id = qi.issue_id
      LEFT JOIN villas v ON v.id = q.villa_id
     WHERE qi.organization_id = ${orgId}
     ORDER BY qi.inspection_date DESC, qi.inspection_number DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    issue_code: string;
    issue_title: string;
    villa_code: string | null;
    inspection_date: string;
    inspection_number: string;
    result: string;
    result_notes: string | null;
  }>(rows).map((r) => ({
    id: r.id,
    issueCode: r.issue_code,
    issueTitle: r.issue_title,
    villaCode: r.villa_code,
    inspectionDate: r.inspection_date,
    inspectionNumber: Number(r.inspection_number),
    result: r.result,
    resultNotes: r.result_notes,
  }));
}

export interface SafetyIncidentRow {
  id: string;
  incidentCode: string;
  projectCode: string | null;
  incidentDate: string;
  severity: string;
  category: string;
  description: string;
  status: string;
}

export async function listSafetyIncidents(limit = 8): Promise<SafetyIncidentRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    incident_code: string;
    project_code: string | null;
    incident_date: string;
    severity: string;
    category: string;
    description: string;
    status: string;
  }>(sql`
    SELECT si.id::text                AS id,
           si.incident_code            AS incident_code,
           p.project_code              AS project_code,
           si.incident_date::text      AS incident_date,
           si.severity                 AS severity,
           si.category                 AS category,
           si.description              AS description,
           si.status                   AS status
      FROM safety_incidents si
      LEFT JOIN projects p ON p.id = si.project_id
     WHERE si.organization_id = ${orgId}
     ORDER BY si.incident_date DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    incident_code: string;
    project_code: string | null;
    incident_date: string;
    severity: string;
    category: string;
    description: string;
    status: string;
  }>(rows).map((r) => ({
    id: r.id,
    incidentCode: r.incident_code,
    projectCode: r.project_code,
    incidentDate: r.incident_date,
    severity: r.severity,
    category: r.category,
    description: r.description,
    status: r.status,
  }));
}
