import "server-only";

import { getDb } from "@/lib/db/client";

import { expireUnpaidDeposits } from "@/features/direct-booking/deposit-expiry";
import type { JobOutcome, JobRunHandle } from "./runner";

const BATCH_LIMIT = 100;

export async function runDirectBookingDepositExpiryJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  if (!getDb()) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { expired: 0, skipped: 0 },
      error: "DB unavailable",
    };
  }
  const out = await expireUnpaidDeposits(new Date(), BATCH_LIMIT);
  await handle.event("info", "Direct-booking deposit expiry sweep complete", {
    ...out,
  });
  return {
    status: "success",
    summary: `expired ${out.expired} · skipped ${out.skipped}`,
    metrics: { expired: out.expired, skipped: out.skipped },
  };
}
