import "server-only";

import { runAttributionForOrg } from "@/lib/marketing/service";
import { requireDb } from "@/lib/db/client";
import { marketingConnections } from "@/lib/db/schema/p4-marketing";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P4.F — Attribution engine cron.
 *
 * Hourly sweep: for every org with active marketing connections,
 * run `runAttributionBackfill` over unattributed conversions in
 * the last 60 days using the last_touch model (operator can
 * override per-org via the marketing UI).
 */
export async function runAttributionEngine(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const orgs = await db
    .selectDistinct({ orgId: marketingConnections.organizationId })
    .from(marketingConnections);

  let scanned = 0;
  let attributed = 0;
  let noTouchpoints = 0;
  for (const o of orgs) {
    try {
      const r = await runAttributionForOrg({
        organizationId: o.orgId,
        config: { model: "last_touch", lookbackWindowDays: 60 },
      });
      scanned += r.scanned;
      attributed += r.attributed;
      noTouchpoints += r.noTouchpoints;
    } catch (err) {
      console.error(`attribution sweep failed for org ${o.orgId}`, err);
    }
  }
  return {
    status: "success",
    summary: `Scanned ${scanned} unattributed conversions across ${orgs.length} orgs; attributed ${attributed}; ${noTouchpoints} had no touchpoints.`,
    metrics: { scanned, attributed, noTouchpoints, orgs: orgs.length },
  };
}
