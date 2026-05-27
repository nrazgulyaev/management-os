/**
 * Phase 2.2 dev-01 — schedule-variance-detector agent (stub).
 *
 * Daily 05:30 cron. Walks all in-flight milestones for each
 * project, computes slip vs target, and surfaces:
 *   - >21d slip      → red flag → notifies PM + Director
 *   - 7–21d slip     → amber flag → goes into PM's daily digest
 *   - schedule drift → quiet log entry in agent_invocation_log
 *
 * Real run logic + the cron wiring land in 2.2 data-wiring. This
 * stub exports the canonical `run` signature so the registry has
 * something to import.
 */

export interface ScheduleVarianceInput {
  /** Org scope. Mirrors the existing agent invocation pattern. */
  organizationId: string;
  /** Optional project filter; omit for org-wide. */
  projectId?: string;
}

export interface ScheduleVarianceFlag {
  projectId: string;
  milestoneId: string;
  milestoneName: string;
  slipDays: number;
  severity: "amber" | "red";
}

export interface ScheduleVarianceOutput {
  flags: ScheduleVarianceFlag[];
  /** Total milestones inspected. */
  scanned: number;
}

export async function run(_input: ScheduleVarianceInput): Promise<ScheduleVarianceOutput> {
  // PR 2.2 dev-01 — stub. Real implementation queries milestones +
  // milestone_dependencies + projects; emits agent_invocation_log
  // entries + agent_outputs rows; sends notifications via the
  // existing operations dispatch.
  return { flags: [], scanned: 0 };
}

export const SCHEDULE_VARIANCE_AGENT = {
  agentCode: "schedule-variance-detector",
  cron: "30 5 * * *", // 05:30 daily
  description: "Daily scan of project milestones for schedule slip; flags amber/red into PM digest.",
} as const;
