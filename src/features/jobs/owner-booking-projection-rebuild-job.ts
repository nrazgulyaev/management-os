import "server-only";

import {
  defaultRebuildWindow,
  rebuildOwnerBookingSummariesForAllOwners,
} from "@/features/owner-bookings/projection";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * Nightly job: rebuilds the owner-booking projection for every active
 * owner across the rolling window (-90d .. +365d).  Owner-safe by
 * construction — the projection layer is the single seam where guest
 * emails / phones / payment provider IDs / finance link IDs are
 * dropped.
 */
export async function runOwnerBookingProjectionRebuildJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const window = defaultRebuildWindow();
  const out = await rebuildOwnerBookingSummariesForAllOwners(window);
  await handle.event("info", "Owner booking projection rebuilt", {
    ...window,
    ...out,
  });
  return {
    status: "success",
    summary: `owners ${out.ownersProcessed} · summaries ${out.summariesUpserted} · breakdowns ${out.breakdownsUpserted} · monthly ${out.monthlyBucketsUpserted}`,
    metrics: {
      ownersProcessed: out.ownersProcessed,
      summaries: out.summariesUpserted,
      breakdowns: out.breakdownsUpserted,
      monthlyBuckets: out.monthlyBucketsUpserted,
    },
  };
}
