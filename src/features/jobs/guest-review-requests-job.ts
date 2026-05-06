import "server-only";

import { runPostStayReviewRequests } from "@/features/guest-journey/runner";
import type { JobOutcome, JobRunHandle } from "./runner";

const BATCH_LIMIT = 100;

/**
 * Daily job: scans recent checkouts (last 14 days) without a review
 * request and creates one. Channel is picked deterministically from
 * the booking's distribution channel.
 */
export async function runGuestReviewRequestsJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const out = await runPostStayReviewRequests(BATCH_LIMIT);
  await handle.event("info", "Review request sweep complete", { ...out });
  return {
    status: "success",
    summary: `created ${out.created} · skipped ${out.skipped}`,
    metrics: { ...out },
  };
}
