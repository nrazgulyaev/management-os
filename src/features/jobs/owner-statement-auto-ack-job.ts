import "server-only";

import { runOwnerStatementAutoAck } from "@/features/owner-statements/auto-ack";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * Daily sweep — auto-acknowledge owner statements whose 14-day window lapsed
 * with no owner action (FC-OWNER-STATEMENTS §4.5). Silent: the underlying
 * sweep writes an audit row only.
 */
export async function runOwnerStatementAutoAckJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const out = await runOwnerStatementAutoAck();
  await handle.event("info", "Owner-statement auto-ack sweep complete", { ...out });
  return {
    status: "success",
    summary: `auto-acknowledged ${out.count} statement${out.count === 1 ? "" : "s"}`,
    metrics: { autoAcked: out.count },
  };
}
