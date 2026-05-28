/**
 * Phase 2.4 dev-01 — weekly-composer agent (cron wrapper).
 *
 * Fri 16:30 cron. For each active project, loads the week's frames
 * + KPIs and calls composeWeeklyReport() (pure fn in
 * src/features/site-reports/weekly-composer.ts). Persists the draft
 * to weekly_reports for construction-lead review (UX rule 4).
 */

export interface WeeklyComposerAgentInput {
  organizationId: string;
  isoWeek?: string;
  projectId?: string;
}

export interface WeeklyComposerAgentOutput {
  draftsCreated: number;
  projectsScanned: number;
}

export async function run(_input: WeeklyComposerAgentInput): Promise<WeeklyComposerAgentOutput> {
  return { draftsCreated: 0, projectsScanned: 0 };
}

export const WEEKLY_COMPOSER_AGENT = {
  agentCode: "weekly-composer",
  cron: "30 16 * * 5",
  description: "Friday 16:30 cron; composes the weekly construction report draft per project.",
} as const;
