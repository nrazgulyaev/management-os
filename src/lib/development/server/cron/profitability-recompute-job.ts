import "server-only";

import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { recomputeAllProfitability } from "@/lib/development/server/profitability/profitability-aggregation";

/**
 * Stage 5.B.3 — Profitability recompute (Sunday 02:00).
 *
 * For each non-archived project, the aggregation engine rolls the dev
 * budget + transaction ledger into per-project land / soft / hard /
 * marketing / financing / contingency cost pools, builds the saleable-asset
 * list, and writes fresh `unit_cost_allocations` rows (one current per
 * asset). Idempotent — derived state recomputed from source-of-truth tables.
 */
export async function runDevOsProfitabilityRecompute(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { recomputed: 0 },
      error: "DB unavailable",
    };
  }

  const run = await recomputeAllProfitability(async (result) => {
    if (result.allocationsWritten > 0) {
      await handle.event(
        "info",
        `recomputed ${result.allocationsWritten} allocation(s) for ${result.projectName} (${result.allocationMethod})`,
        {
          projectId: result.projectId,
          allocationsWritten: result.allocationsWritten,
          pools: result.pools,
        },
      );
    } else if (result.skippedReason) {
      await handle.event("debug", `skipped ${result.projectName}: ${result.skippedReason}`, {
        projectId: result.projectId,
      });
    }
  });

  return {
    status: "success",
    summary: `Profitability recompute: ${run.projectsRecomputed}/${run.projectsScanned} project(s), ${run.allocationsWritten} allocation(s) written.`,
    metrics: {
      projectsScanned: run.projectsScanned,
      projectsRecomputed: run.projectsRecomputed,
      allocationsWritten: run.allocationsWritten,
    },
  };
}
