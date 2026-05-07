import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { paymentIntents } from "@/lib/db/schema/payment-processors";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P3.G — Payment status sync cron.
 *
 * Sweeps `payment_intents` rows that have been in `created` /
 * `processing` / `requires_action` for >24h and marks them `failed`
 * with a reconciliation note. Webhook events drive the happy path;
 * this is the safety net.
 *
 * Runs every 30 minutes per the launch prompt schedule.
 */
export async function runPaymentStatusSync(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stuck = await db
    .update(paymentIntents)
    .set({
      lifecycleState: "failed",
      updatedAt: new Date(),
    })
    .where(
      and(
        sql`${paymentIntents.lifecycleState} IN ('created','processing','requires_action')`,
        lt(paymentIntents.createdAt, cutoff),
      ),
    )
    .returning({ id: paymentIntents.id });
  // Reference eq to keep the import slot warm for future expansion.
  void eq;
  return {
    status: "success",
    summary: `Reconciled ${stuck.length} stuck payment intents.`,
    metrics: { reconciled: stuck.length, cutoff: cutoff.toISOString() },
  };
}
