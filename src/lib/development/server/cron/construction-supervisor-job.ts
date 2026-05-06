import "server-only";

import {
  analyzeSiteReport,
  findReportsNeedingAnalysis,
} from "@/lib/development/ai/construction-supervisor";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 3.B — Construction Supervisor cron.
 *
 * Pulls up to 10 submitted reports without an active analysis (oldest
 * first) and runs the supervisor on each. Stops on the first
 * `budget_exceeded` outcome.
 *
 * Schedule: every 30 minutes. Idempotent — already-analyzed reports
 * are filtered by the partial unique index on the active set.
 */
export async function runDevOsConstructionSupervisor(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const ids = await findReportsNeedingAnalysis(10);
  if (ids.length === 0) {
    return {
      status: "success",
      summary: "No reports needing analysis.",
      metrics: { attempted: 0, succeeded: 0, dry_run: 0, failed: 0 },
    };
  }

  let succeeded = 0;
  let dryRun = 0;
  let failed = 0;
  let skipped = 0;
  let budgetBlocked = 0;
  for (const id of ids) {
    const res = await analyzeSiteReport(id);
    if (res.status === "succeeded") succeeded += 1;
    else if (res.status === "dry_run") dryRun += 1;
    else if (res.status === "skipped_active_analysis") skipped += 1;
    else if (res.status === "budget_exceeded") {
      budgetBlocked += 1;
      await handle.event("warning", "construction_supervisor_budget_exceeded", {
        reportId: id,
        reason: res.errorMessage,
      });
      break;
    } else {
      failed += 1;
      await handle.event("error", "construction_supervisor_failed", {
        reportId: id,
        errorMessage: res.errorMessage,
      });
    }
  }

  const status: JobOutcome["status"] =
    failed > 0 && succeeded + dryRun === 0 ? "failed" : "success";
  return {
    status,
    summary: `Construction supervisor: ${succeeded} succeeded, ${dryRun} dry-run, ${skipped} already-active, ${failed} failed, ${budgetBlocked} budget-blocked.`,
    metrics: {
      attempted: ids.length,
      succeeded,
      dry_run: dryRun,
      skipped_active: skipped,
      failed,
      budget_exceeded: budgetBlocked,
    },
  };
}
