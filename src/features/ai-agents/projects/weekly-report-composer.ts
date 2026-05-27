/**
 * Phase 2.2 dev-01 — weekly-report-composer agent (stub).
 *
 * Friday investor-update drafter. Walks the past 7 days of
 * milestones, BOQ deltas, RFIs resolved, and site reports; drafts
 * a one-page brief into `agent_outputs` for the Director to
 * review + send.
 *
 * Real composer + the cron schedule land in 2.2 data-wiring.
 */

export interface WeeklyReportInput {
  organizationId: string;
  projectId: string;
  /** Week-ending date (ISO YYYY-MM-DD). */
  weekEnding: string;
}

export interface WeeklyReportOutput {
  /** Markdown body of the draft. */
  markdown: string;
  /** Highlights surfaced in the agent output card. */
  highlights: { label: string; value: string }[];
}

export async function run(input: WeeklyReportInput): Promise<WeeklyReportOutput> {
  // PR 2.2 dev-01 — stub. Real implementation queries milestones,
  // BOQ lines, RFIs, site reports, then prompts the chosen model
  // through the existing Vault-backed router.
  return {
    markdown: `# Weekly update · ${input.projectId}\n\n_Drafted by weekly-report-composer (stub) for week ending ${input.weekEnding}._\n\nReal aggregation lands in 2.2 data-wiring.`,
    highlights: [
      { label: "Milestones closed", value: "—" },
      { label: "BOQ delta", value: "—" },
      { label: "RFIs resolved", value: "—" },
    ],
  };
}

export const WEEKLY_REPORT_AGENT = {
  agentCode: "weekly-report-composer",
  cron: "0 14 * * FRI", // Fri 14:00 local
  description:
    "Drafts a Friday investor update from the past 7 days of milestones, BOQ deltas, RFIs, and site reports.",
} as const;
