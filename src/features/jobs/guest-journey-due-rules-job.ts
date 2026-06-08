import "server-only";

import { getDb } from "@/lib/db/client";

import { runDueGuestJourneyRules } from "@/features/guest-journey/runner";
import type { JobOutcome, JobRunHandle } from "./runner";

const BATCH_LIMIT = 100;

/**
 * Walks pending journey runs whose `scheduled_for <= now` and
 * dispatches each. Idempotent — every run dispatch is keyed by the
 * `(booking, rule)` unique index, so re-running this job is safe.
 */
export async function runGuestJourneyDueRulesJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  if (!getDb()) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { executed: 0, skipped: 0, failed: 0 },
      error: "DB unavailable",
    };
  }
  const out = await runDueGuestJourneyRules(BATCH_LIMIT);
  await handle.event("info", "Due guest journey runs processed", { ...out });
  const status =
    out.failed > 0 && out.executed > 0
      ? "partial_success"
      : out.failed > 0
        ? "failed"
        : "success";
  return {
    status,
    summary: `executed ${out.executed} · skipped ${out.skipped} · failed ${out.failed}`,
    metrics: { ...out },
    error: out.failed > 0 ? `${out.failed} run(s) failed` : undefined,
  };
}
