import "server-only";

import { sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { bankConnections } from "@/lib/db/schema/banking";
import { runAutoReconciliation } from "@/lib/banking/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P3.G — Reconciliation-engine cron.
 *
 * Re-runs the auto-matcher over every org's still-unmatched bank
 * transactions. Catches the case where a bank transaction landed
 * before the corresponding invoice did — the next pass picks it up.
 *
 * Runs every 30 minutes per the launch prompt schedule.
 */
export async function runReconciliationEngine(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const orgs = await db
    .selectDistinct({ orgId: bankConnections.organizationId })
    .from(bankConnections);
  let scanned = 0;
  let matched = 0;
  let partial = 0;
  for (const o of orgs) {
    try {
      const r = await runAutoReconciliation({ organizationId: o.orgId });
      scanned += r.scanned;
      matched += r.matched;
      partial += r.partial;
    } catch (err) {
      console.error(`reconciliation pass failed for org ${o.orgId}`, err);
    }
  }
  // Suppress unused warning while still importing sql for future
  // expansion (per-org partial-window logic).
  void sql;
  return {
    status: "success",
    summary: `Scanned ${scanned} unmatched, auto-matched ${matched}, flagged ${partial} as partial.`,
    metrics: { scanned, matched, partial, orgs: orgs.length },
  };
}
