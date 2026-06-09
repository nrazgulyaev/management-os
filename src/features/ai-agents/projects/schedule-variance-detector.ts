/**
 * Phase 2.2 dev-01 — schedule-variance-detector agent.
 *
 * Daily 05:30 cron. Walks all in-flight milestones for each project,
 * computes slip vs target (and slip propagated through finish-to-start
 * dependency edges), and surfaces:
 *   - ≥21d slip   → red flag   → notifies PM + Director
 *   - 7–20d slip  → amber flag → goes into PM's daily digest
 *
 * The deterministic rule logic lives in the server-only-free module
 * `schedule-variance-rules.ts` so it is unit-testable and reused by the
 * project milestones page to render its read-only "Schedule variance" band.
 *
 * This run() is read-only: it queries `milestones` + `milestone_dependencies`
 * and returns the flags. Persisting flags to `agent_outputs` /
 * `agent_invocation_log` and dispatching PM/Director notifications is the
 * documented data-wiring follow-up (see followups); doing it here would
 * couple this unit to the notifications dispatch.
 */

import { getDb } from "@/lib/db/client";
import { eq, inArray } from "drizzle-orm";
import { milestones, milestoneDependencies } from "@/lib/db/schema/milestones";
import {
  detectScheduleVariance,
  type ScheduleVarianceSeverity,
} from "./schedule-variance-rules";

export interface ScheduleVarianceInput {
  /** Org scope. Mirrors the existing agent invocation pattern. */
  organizationId: string;
  /** Optional project filter; omit for org-wide. */
  projectId?: string;
  /** Override "now" for deterministic replay; defaults to the wall clock. */
  asOf?: Date;
}

export interface ScheduleVarianceFlag {
  projectId: string;
  milestoneId: string;
  milestoneName: string;
  slipDays: number;
  severity: ScheduleVarianceSeverity;
}

export interface ScheduleVarianceOutput {
  flags: ScheduleVarianceFlag[];
  /** Total milestones inspected. */
  scanned: number;
}

export async function run(input: ScheduleVarianceInput): Promise<ScheduleVarianceOutput> {
  const db = getDb();
  if (!db) return { flags: [], scanned: 0 };

  const milestoneRows = input.projectId
    ? await db.select().from(milestones).where(eq(milestones.projectId, input.projectId))
    : await db.select().from(milestones);

  if (milestoneRows.length === 0) return { flags: [], scanned: 0 };

  // Only need edges whose endpoints are in scope; when filtering by project
  // both endpoints are same-project (dependencies are intra-project).
  const ids = milestoneRows.map((m) => m.id);
  const edges = await db
    .select()
    .from(milestoneDependencies)
    .where(inArray(milestoneDependencies.toMilestoneId, ids));

  const { flags, scanned } = detectScheduleVariance(
    milestoneRows.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      name: m.name,
      targetDate: m.targetDate,
      actualDate: m.actualDate,
      status: m.status,
    })),
    edges.map((e) => ({
      fromMilestoneId: e.fromMilestoneId,
      toMilestoneId: e.toMilestoneId,
      kind: e.kind,
    })),
    input.asOf ?? new Date(),
  );

  return {
    flags: flags.map((f) => ({
      projectId: f.projectId,
      milestoneId: f.milestoneId,
      milestoneName: f.milestoneName,
      slipDays: f.slipDays,
      severity: f.severity,
    })),
    scanned,
  };
}

export const SCHEDULE_VARIANCE_AGENT = {
  agentCode: "schedule-variance-detector",
  cron: "30 5 * * *", // 05:30 daily
  description: "Daily scan of project milestones for schedule slip; flags amber/red into PM digest.",
} as const;
