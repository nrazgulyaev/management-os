import "server-only";

import {
  findProjectsNeedingSuggestion,
  suggestDistribution,
} from "@/lib/development/ai/distribution-preview";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 3.C — Distribution Preview cron.
 *
 * For each self-sustaining project without an active suggestion,
 * generates a fresh suggestion. Stops on first `budget_exceeded`.
 *
 * Schedule: `0 10 * * 1` (10am every Monday). Idempotent — projects
 * with an active draft are filtered by the partial unique index.
 */
export async function runDevOsDistributionPreview(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const ids = await findProjectsNeedingSuggestion();
  if (ids.length === 0) {
    return {
      status: "success",
      summary: "No projects need a distribution suggestion right now.",
      metrics: { attempted: 0, succeeded: 0, dry_run: 0, failed: 0 },
    };
  }

  let succeeded = 0;
  let dryRun = 0;
  let cooldown = 0;
  let activeSkipped = 0;
  let failed = 0;
  let budgetBlocked = 0;
  for (const id of ids) {
    const res = await suggestDistribution({
      projectId: id,
      triggeredBy: "cron_check",
    });
    if (res.status === "succeeded") succeeded += 1;
    else if (res.status === "dry_run") dryRun += 1;
    else if (res.status === "skipped_cooldown") cooldown += 1;
    else if (res.status === "skipped_active") activeSkipped += 1;
    else if (res.status === "budget_exceeded") {
      budgetBlocked += 1;
      await handle.event("warning", "distribution_preview_budget_exceeded", {
        projectId: id,
        reason: res.errorMessage,
      });
      break;
    } else {
      failed += 1;
      await handle.event("error", "distribution_preview_failed", {
        projectId: id,
        errorMessage: res.errorMessage,
      });
    }
  }

  const status: JobOutcome["status"] =
    failed > 0 && succeeded + dryRun === 0 ? "failed" : "success";
  return {
    status,
    summary: `Distribution preview: ${succeeded} succeeded, ${dryRun} dry-run, ${cooldown} in cooldown, ${activeSkipped} already-active, ${failed} failed, ${budgetBlocked} budget-blocked.`,
    metrics: {
      attempted: ids.length,
      succeeded,
      dry_run: dryRun,
      skipped_cooldown: cooldown,
      skipped_active: activeSkipped,
      failed,
      budget_exceeded: budgetBlocked,
    },
  };
}
