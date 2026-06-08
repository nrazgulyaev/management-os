import "server-only";

import { getDb } from "@/lib/db/client";

import { runDirectBookingExpiry } from "@/features/direct-booking/expiry";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * Walks active direct-booking holds whose `expires_at < now` and has
 * no converted booking; marks each as `expired`, releases the
 * calendar block, and expires linked submitted/under_review requests.
 */
export async function runDirectBookingHoldExpiryJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  if (!getDb()) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { expiredHolds: 0, expiredRequests: 0, releasedBlocks: 0 },
      error: "DB unavailable",
    };
  }
  const out = await runDirectBookingExpiry();
  await handle.event("info", "Direct-booking hold expiry sweep complete", {
    ...out,
  });
  return {
    status: "success",
    summary: `expired ${out.expiredHolds} hold${out.expiredHolds === 1 ? "" : "s"} · ${out.expiredRequests} request${out.expiredRequests === 1 ? "" : "s"} · released ${out.releasedBlocks}`,
    metrics: {
      expiredHolds: out.expiredHolds,
      expiredRequests: out.expiredRequests,
      releasedBlocks: out.releasedBlocks,
    },
  };
}
