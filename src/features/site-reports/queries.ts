/**
 * Phase 2.4 dev-01 — Site-reports cabinet data fns.
 *
 * Surfaces:
 *   getSiteDays           — storyboard scroll data
 *   getIncident           — single incident detail
 *   getWeeklyReport       — published or draft weekly
 *   submitSiteFrame       — capture-flow post target
 *
 * Today stubbed.
 */

import "server-only";
import type { StoryboardDay } from "@/components/site-reports/storyboard-log";
import type { CaptureDraft } from "@/components/site-reports/capture-flow";
import type { IncidentDetailProps } from "@/components/site-reports/incident-detail";
import type { WeeklyReportProps } from "@/components/site-reports/weekly-report-pdf";

export interface GetSiteDaysInput {
  projectId: string;
  days?: number;
}

export async function getSiteDays(_input: GetSiteDaysInput): Promise<StoryboardDay[]> {
  return [];
}

export async function getIncident(incidentId: string): Promise<IncidentDetailProps | null> {
  void incidentId;
  return null;
}

export async function getWeeklyReport(projectId: string, isoWeek: string): Promise<WeeklyReportProps | null> {
  void projectId;
  void isoWeek;
  return null;
}

export interface SubmitSiteFrameInput extends CaptureDraft {
  projectId: string;
  authorUserId: string;
}

export async function submitSiteFrame(_input: SubmitSiteFrameInput): Promise<{ frameId: string }> {
  return { frameId: "stub" };
}
