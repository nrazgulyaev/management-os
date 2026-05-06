import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

const TOLERANCE_USD_MINOR = 100n; // $1 USD

/**
 * For each active bank account, computes expected balance from the sum
 * of `dev_transactions` for that account (inflows − outflows) starting
 * from balance 0 (or the most recent manual reconciliation) and compares
 * to `current_balance_minor`. If the discrepancy exceeds tolerance,
 * fires a `bank_balance_discrepancy` notification.
 *
 * NOTE: this job does NOT auto-correct balances — it only alerts. The
 * operator decides whether to investigate and use `recordBankBalance`
 * to apply a manual reconciliation.
 *
 * Tolerance is $1 USD equivalent (100 USD minor) — covers FX rounding
 * across multi-currency accounts. For pure USD accounts it's equivalent
 * to "exact match within a dollar".
 *
 * Idempotent: pure read + alert; no DB mutations on this path.
 */
export async function runDevOsBalanceReconciliation(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { reconciled: 0 },
      error: "DB unavailable",
    };
  }

  const rows = await db.execute(sql`
    SELECT
      a.id,
      a.account_code,
      a.currency,
      a.current_balance_minor::text AS current_balance_minor,
      coalesce(
        sum(t.amount_minor) FILTER (WHERE t.direction = 'inflow'),
        0
      )::bigint - coalesce(
        sum(t.amount_minor) FILTER (WHERE t.direction = 'outflow'),
        0
      )::bigint AS expected_balance_minor,
      a.current_balance_usd_minor::text AS current_balance_usd_minor,
      coalesce(
        sum(t.amount_usd_minor) FILTER (WHERE t.direction = 'inflow'),
        0
      )::bigint - coalesce(
        sum(t.amount_usd_minor) FILTER (WHERE t.direction = 'outflow'),
        0
      )::bigint AS expected_balance_usd_minor
    FROM dev_bank_accounts a
    LEFT JOIN dev_transactions t ON t.bank_account_id = a.id
    WHERE a.is_active = true
    GROUP BY a.id, a.account_code, a.currency, a.current_balance_minor, a.current_balance_usd_minor
  `);

  let checked = 0;
  let discrepancies = 0;
  for (const r of rows as Record<string, unknown>[]) {
    checked += 1;
    const current = BigInt(String(r.current_balance_minor));
    const expected = BigInt(String(r.expected_balance_minor));
    const currentUsd = BigInt(String(r.current_balance_usd_minor));
    const expectedUsd = BigInt(String(r.expected_balance_usd_minor));
    const driftUsd =
      currentUsd > expectedUsd
        ? currentUsd - expectedUsd
        : expectedUsd - currentUsd;

    if (driftUsd > TOLERANCE_USD_MINOR) {
      discrepancies += 1;
      await handle.event("warning", "bank_balance_discrepancy", {
        accountId: String(r.id),
        accountCode: String(r.account_code),
        currency: String(r.currency),
        currentBalanceMinor: current.toString(),
        expectedBalanceMinor: expected.toString(),
        driftUsdMinor: driftUsd.toString(),
      });
    }
  }

  return {
    status: "success",
    summary: `Reconciled ${checked} accounts (${discrepancies} discrepancies).`,
    metrics: { checked, discrepancies },
  };
}
