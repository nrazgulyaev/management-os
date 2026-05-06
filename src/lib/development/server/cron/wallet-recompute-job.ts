import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { investorWallets } from "@/lib/db/schema/investor-capital";

/**
 * Stage 4.B.2 — Wallet recompute (daily 03:00).
 *
 * For each investor wallet, recomputes:
 *   - residual_inventory_value_minor = SUM(economic_claim_minor over
 *     this investor's active residual_unit_ownership_shares)
 *   - economic_balance_minor = cash + reinvestment + pending_distribution
 *                              + residual_inventory_value
 *   - last_recomputed_at = now()
 *
 * Idempotent — derived state recomputed from source-of-truth tables.
 * Job is read-only with respect to cash_balance / committed_balance —
 * those buckets are mutated only by recordWalletMovement.
 */
export async function runDevOsWalletRecompute(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { recomputed: 0 },
      error: "DB unavailable",
    };
  }

  const wallets = await db.select().from(investorWallets);

  let recomputed = 0;
  let failed = 0;

  for (const w of wallets) {
    try {
      const result = await db.execute<{ residual: string }>(sql`
        SELECT COALESCE(SUM(s.economic_claim_minor), 0)::text AS residual
          FROM residual_unit_ownership_shares s
          JOIN capital_commitments cc ON cc.investor_id = s.investor_id
         WHERE cc.id = ${w.commitmentId}
      `);
      const rows = (result as unknown as { rows: Array<{ residual: string }> })
        .rows ?? [];
      const residual = rows[0]?.residual ?? "0";

      const residualValue = BigInt(residual);
      const economic =
        BigInt(w.cashBalanceMinor) +
        BigInt(w.reinvestmentBalanceMinor) +
        BigInt(w.pendingDistributionMinor) +
        residualValue;

      await db
        .update(investorWallets)
        .set({
          residualInventoryValueMinor: residualValue,
          economicBalanceMinor: economic,
          lastRecomputedAt: new Date(),
        })
        .where(eq(investorWallets.id, w.id));

      recomputed++;
    } catch (err) {
      failed++;
      await handle.event(
        "error",
        `wallet ${w.id} recompute failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    status: failed === 0 ? "success" : "partial_success",
    summary: `Recomputed ${recomputed} wallet(s)${failed ? `, ${failed} failed` : ""}.`,
    metrics: { recomputed, failed },
  };
}
