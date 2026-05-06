import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devBankAccounts } from "@/lib/db/schema/dev-finance";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

const COOLDOWN_HOURS = 24;
const BUFFER_PERCENT = 0.25;

/**
 * Finds bank accounts where `current_balance_minor < minimum_balance_threshold_minor`
 * and the cooldown window (`last_balance_alert_at`, default 24h) has elapsed.
 * For each, fires `bank_balance_below_threshold` notification rule and updates
 * `last_balance_alert_at` so the same account won't be alerted again within
 * the cooldown.
 *
 * Suggested drawdown amount = (threshold − balance) + threshold × 25% buffer.
 *
 * Notification dispatch is delegated to the existing `dev_notification_*` system —
 * this job only fires the trigger event; the dispatcher (Stage 2.2.B) sends the
 * actual email/in-app message.
 */
export async function runDevOsBalanceAlert(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { alerted: 0 },
      error: "DB unavailable",
    };
  }

  const cooldownCutoff = new Date(
    Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000,
  );

  // Eligible: active, threshold set, balance < threshold, and either never
  // alerted or last alert before the cooldown cutoff.
  const candidates = await db
    .select()
    .from(devBankAccounts)
    .where(
      sql`${devBankAccounts.isActive} = true
        AND ${devBankAccounts.minimumBalanceThresholdMinor} IS NOT NULL
        AND ${devBankAccounts.currentBalanceMinor} < ${devBankAccounts.minimumBalanceThresholdMinor}
        AND (${devBankAccounts.lastBalanceAlertAt} IS NULL
             OR ${devBankAccounts.lastBalanceAlertAt} < ${cooldownCutoff.toISOString()})`,
    );

  let alerted = 0;
  let skippedCooldown = 0;
  for (const a of candidates) {
    const threshold = BigInt(a.minimumBalanceThresholdMinor!);
    const balance = BigInt(a.currentBalanceMinor);
    const deficit = threshold - balance;
    const buffer = (threshold * BigInt(Math.floor(BUFFER_PERCENT * 100))) / 100n;
    const suggested = deficit + buffer;
    await handle.event("warning", "bank_balance_below_threshold", {
      accountId: a.id,
      accountCode: a.accountCode,
      currentBalanceMinor: balance.toString(),
      thresholdMinor: threshold.toString(),
      currency: a.currency,
      suggestedDrawdownMinor: suggested.toString(),
    });
    await db
      .update(devBankAccounts)
      .set({
        lastBalanceAlertAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(devBankAccounts.id, a.id));
    alerted += 1;
  }

  // For metrics: count accounts in deficit but on cooldown.
  const [{ count: belowAndCooldown }] = (await db.execute(sql`
    SELECT count(*)::int AS count
    FROM dev_bank_accounts
    WHERE is_active = true
      AND minimum_balance_threshold_minor IS NOT NULL
      AND current_balance_minor < minimum_balance_threshold_minor
      AND last_balance_alert_at IS NOT NULL
      AND last_balance_alert_at >= ${cooldownCutoff.toISOString()}
  `)) as Array<{ count: number }>;
  skippedCooldown = belowAndCooldown;

  return {
    status: "success",
    summary: `Alerted ${alerted} accounts below threshold (${skippedCooldown} on cooldown).`,
    metrics: { alerted, skippedCooldown },
  };
}
