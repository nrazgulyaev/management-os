import "server-only";

import { archiveInactiveThreads } from "@/lib/messaging/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P2.F.7 — Inbox cleanup cron.
 *
 * Auto-archives `conversation_threads` rows that have been silent for
 * 90 days. Archive is reversible via the inbox UI; the goal is just
 * to keep the active list manageable.
 *
 * Threshold is intentionally generous — operators can extend it via
 * the cron schedule or by tweaking the inactiveSince calculation.
 */
const INACTIVE_DAYS = 90;

export async function runMessagingCleanup(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const inactiveSince = new Date(
    Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000,
  );
  const archivedCount = await archiveInactiveThreads({ inactiveSince });
  return {
    status: "success",
    summary: `Archived ${archivedCount} threads inactive since ${inactiveSince.toISOString()}.`,
    metrics: {
      archived: archivedCount,
      threshold_days: INACTIVE_DAYS,
    },
  };
}
