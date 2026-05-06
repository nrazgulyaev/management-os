import "server-only";

import { expireUnpaidDeposits } from "@/features/direct-booking/deposit-expiry";
import type { JobOutcome, JobRunHandle } from "./runner";

const BATCH_LIMIT = 100;

export async function runDirectBookingDepositExpiryJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
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
