import "server-only";

import { detectAndFlagConflicts } from "@/lib/channel-manager/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P1.G.1 — Calendar conflict detector cron.
 *
 * Hourly sweep over recent channel reservations to catch conflicts
 * the per-reservation pipeline missed. The pipeline already detects
 * conflicts at insert time, but this catches:
 *   - Race conditions (two reservations land in the same second)
 *   - Cases where the existing booking changed dates after the
 *     channel reservation was confirmed conflict-free
 *   - Manual booking inserts that overlap an already-projected channel
 *     reservation
 *
 * Returns the count of newly-flagged reservations as a metric so the
 * status dashboard can surface "X conflicts auto-detected this hour".
 */
export async function runChannelConflictDetector(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const flagged = await detectAndFlagConflicts({
    receivedSince: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  return {
    status: "success",
    summary: `Flagged ${flagged} new conflict${flagged === 1 ? "" : "s"} from the last 24h.`,
    metrics: { newly_flagged: flagged },
  };
}
