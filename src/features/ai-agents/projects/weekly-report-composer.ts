import "server-only";

/**
 * Phase 2.2 dev-01 — weekly-report-composer agent.
 *
 * Friday investor-update drafter. Walks the past 7 days of milestones
 * progressed, BOQ/cost movement, RFIs opened/closed, and daily site
 * reports for a project; assembles a deterministic one-page brief and
 * (optionally) polishes it with the org's configured LLM.
 *
 * Deterministic assembly lives in the pure, unit-testable
 * `weekly-report-assembly.ts`; the DB reads + graceful AI polish live in
 * `weekly-report-data.ts`. This module is the thin agent entrypoint that
 * keeps the canonical `run()` signature the registry expects.
 */

import { composeWeeklyReport } from "./weekly-report-data";
import { assembleWeeklyReport } from "./weekly-report-assembly";

export interface WeeklyReportInput {
  organizationId: string;
  projectId: string;
  /** Week-ending date (ISO YYYY-MM-DD). */
  weekEnding: string;
  /** Owning user, for the optional AI run's audit trail. */
  triggeredByUserId?: string | null;
  /** Skip the LLM polish and return the deterministic draft only. */
  skipAiPolish?: boolean;
}

export interface WeeklyReportOutput {
  /** Markdown body of the draft (AI-polished when available). */
  markdown: string;
  /** Deterministic markdown — always present, regardless of AI. */
  deterministicMarkdown: string;
  /** Highlights surfaced in the agent output card. */
  highlights: { label: string; value: string }[];
  /** Whether the LLM polish was applied. */
  aiPolished: boolean;
  /** Operator-facing note when AI was skipped or fell back. */
  aiNote: string | null;
  /** True when nothing of substance happened in the window. */
  isQuiet: boolean;
}

export async function run(input: WeeklyReportInput): Promise<WeeklyReportOutput> {
  const result = await composeWeeklyReport({
    organizationId: input.organizationId,
    projectId: input.projectId,
    weekEnding: input.weekEnding,
    triggeredByUserId: input.triggeredByUserId ?? null,
    skipAiPolish: input.skipAiPolish,
  });

  if (!result) {
    // DB down or project not found — degrade to an empty, well-formed brief
    // rather than throwing, so the cron / page surface stays resilient.
    const empty = assembleWeeklyReport({
      projectName: input.projectId,
      weekStart: input.weekEnding,
      weekEnding: input.weekEnding,
      boqCurrency: "IDR",
      milestones: [],
      boqMovements: [],
      rfis: [],
      siteReports: [],
    });
    return {
      markdown: empty.markdown,
      deterministicMarkdown: empty.markdown,
      highlights: empty.highlights,
      aiPolished: false,
      aiNote: "No data available (database unconfigured or project not found).",
      isQuiet: true,
    };
  }

  return {
    markdown: result.markdown,
    deterministicMarkdown: result.deterministicMarkdown,
    highlights: result.highlights,
    aiPolished: result.aiPolished,
    aiNote: result.aiNote,
    isQuiet: result.isQuiet,
  };
}

export const WEEKLY_REPORT_AGENT = {
  agentCode: "weekly-report-composer",
  cron: "0 14 * * FRI", // Fri 14:00 local
  description:
    "Drafts a Friday investor update from the past 7 days of milestones, BOQ deltas, RFIs, and site reports.",
} as const;
