import "server-only";

import { archiveOldTouchpoints } from "@/lib/marketing/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P4.F — UTM touchpoint cleanup cron.
 *
 * Daily delete of `attribution_touchpoints` rows older than 90 days
 * that never got linked to a contact (these are anonymous visitors
 * that never converted). Touchpoints linked to contacts are
 * preserved indefinitely so historical conversion attribution
 * survives.
 */
export async function runUtmTouchpointCleanup(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const archived = await archiveOldTouchpoints({ olderThanDays: 90 });
  return {
    status: "success",
    summary: `Archived ${archived} anonymous touchpoints older than 90 days.`,
    metrics: { archived },
  };
}
