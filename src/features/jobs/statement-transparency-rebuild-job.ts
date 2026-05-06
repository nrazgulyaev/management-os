import "server-only";

import { rebuildAllStatementTransparency } from "@/features/statement-transparency/rebuild";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * Nightly job: rebuild the transparency layer for every recent
 * statement (period ending in the last 120 days) in `draft` /
 * `issued` / `approved` status.
 *
 * The transparency layer is a derived view, so it is safe to wipe +
 * reinsert per statement.  The job is idempotent.
 */
export async function runStatementTransparencyRebuildJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const out = await rebuildAllStatementTransparency({});
  await handle.event("info", "Statement transparency rebuilt", { ...out });
  return {
    status: "success",
    summary: `statements ${out.statementsProcessed} · groups ${out.totalGroupsInserted} · warnings ${out.totalWarningsInserted}`,
    metrics: {
      statementsProcessed: out.statementsProcessed,
      totalGroupsInserted: out.totalGroupsInserted,
      totalWarningsInserted: out.totalWarningsInserted,
    },
  };
}
