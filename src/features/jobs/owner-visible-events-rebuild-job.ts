import "server-only";

import { getDb } from "@/lib/db/client";

import { rebuildOwnerVisibleEventsForAllOwners } from "@/features/guest-journey/owner-events-rebuild";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * Nightly job: rebuilds the owner-visible events projection for
 * every active owner. Default window: -90d .. +120d so the calendar
 * always looks fresh on either side of "today".
 */
export async function runOwnerVisibleEventsRebuildJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  if (!getDb()) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { ownersProcessed: 0, inserted: 0 },
      error: "DB unavailable",
    };
  }
  const today = new Date();
  const fromDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
  const toDate = new Date(today.getTime() + 120 * 24 * 60 * 60 * 1000);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);
  const out = await rebuildOwnerVisibleEventsForAllOwners(from, to);
  await handle.event("info", "Owner-visible events rebuilt", {
    from,
    to,
    ...out,
  });
  return {
    status: "success",
    summary: `owners ${out.ownersProcessed} · inserted ${out.inserted}`,
    metrics: {
      from,
      to,
      ownersProcessed: out.ownersProcessed,
      inserted: out.inserted,
    },
  };
}
