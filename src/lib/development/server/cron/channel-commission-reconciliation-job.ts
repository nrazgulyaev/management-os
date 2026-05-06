import "server-only";

import { reconcileCommissionRecords } from "@/lib/channel-manager/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P1.G.1 — Channel commission reconciliation cron.
 *
 * Daily sweep:
 *   - Auto-reconciles records where invoice_received + payment_made
 *     are both true → flips reconciled=true.
 *   - Flags records >30 days old that are still unreconciled — these
 *     surface on the bookkeeper's dashboard as outstanding commission
 *     liability that needs operator action (chase the channel for an
 *     invoice, or write off).
 *
 * This is read-mostly + low-volume — runs once per day at 02:00 UTC
 * to avoid contending with the morning ops digests.
 */
export async function runChannelCommissionReconciliation(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const result = await reconcileCommissionRecords();
  return {
    status: "success",
    summary: `Auto-reconciled ${result.reconciled} record${result.reconciled === 1 ? "" : "s"}; ${result.flagged} stale record${result.flagged === 1 ? "" : "s"} need operator attention.`,
    metrics: {
      auto_reconciled: result.reconciled,
      stale_unreconciled: result.flagged,
    },
  };
}
