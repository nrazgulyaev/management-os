import "server-only";

import { analyzePhoto, findUnanalyzedPhotos } from "@/lib/development/ai/photo-analyst";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 3.A — AI Photo Analyst cron.
 *
 * Pulls up to 25 unanalyzed photos per tick (oldest first) and runs the
 * photo-analyst agent against each. Stops early if the budget rejects
 * a call so a single tick doesn't burn through the daily ceiling.
 *
 * Scheduling target: every 15 minutes. Idempotent — analyzed photos
 * are filtered out on the next tick by the `ai_analyzed_at IS NULL`
 * predicate.
 */
export async function runDevOsPhotoAnalyst(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const ids = await findUnanalyzedPhotos(25);
  if (ids.length === 0) {
    return {
      status: "success",
      summary: "No unanalyzed photos.",
      metrics: { attempted: 0, succeeded: 0, failed: 0, budget_exceeded: 0 },
    };
  }

  let succeeded = 0;
  let failed = 0;
  let dryRun = 0;
  let budgetBlocked = 0;
  for (const id of ids) {
    const res = await analyzePhoto(id);
    if (res.status === "succeeded") succeeded += 1;
    else if (res.status === "dry_run") dryRun += 1;
    else if (res.status === "budget_exceeded") {
      budgetBlocked += 1;
      await handle.event("warning", "photo_analyst_budget_exceeded", {
        photoId: id,
        reason: res.errorMessage,
      });
      // Stop the loop — daily/monthly cap already hit.
      break;
    } else if (res.status === "failed") {
      failed += 1;
      await handle.event("error", "photo_analyst_failed", {
        photoId: id,
        errorMessage: res.errorMessage,
      });
    }
  }

  const status: JobOutcome["status"] =
    failed > 0 && succeeded + dryRun === 0 ? "failed" : "success";
  return {
    status,
    summary: `Photo analyst: ${succeeded} succeeded, ${dryRun} dry-run, ${failed} failed, ${budgetBlocked} budget-blocked.`,
    metrics: {
      attempted: ids.length,
      succeeded,
      failed,
      dry_run: dryRun,
      budget_exceeded: budgetBlocked,
    },
  };
}
