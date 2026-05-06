import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

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
  const summaryRow =
    (summary as unknown as {
      rows: Array<{
        today_reports: string;
        qaqc_assigned: string;
        materials_today: string;
        yest_photos: string;
        yest_workforce: string;
      }>;
    }).rows?.[0] ?? null;

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
    recentReports:
      (recentRows as unknown as {
        rows: Array<{ id: string; report_date: string; project_id: string }>;
      }).rows?.map((r) => ({
        id: r.id,
        reportDate: r.report_date,
        projectId: r.project_id,
      })) ?? [],
  };
}
