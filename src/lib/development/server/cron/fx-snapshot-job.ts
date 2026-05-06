import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devFxSnapshots } from "@/lib/db/schema/dev-finance";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Ensures `dev_fx_snapshots` has an entry for today. If not, falls
 * forward by inserting today's date with the most recent snapshot's
 * rates (`source='rolled_forward'`).
 *
 * API integration is intentionally deferred — Stage 2.3.B uses the
 * rolled-forward fallback only. When an API source lands, this job
 * will attempt the API first and only fall back if the fetch fails.
 *
 * Idempotent: UNIQUE constraint on `snapshot_date` prevents
 * duplicates; the early-exit check skips the insert when today's
 * snapshot already exists.
 */
export async function runDevOsFxSnapshot(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { inserted: 0 },
      error: "DB unavailable",
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  const existing = await db
    .select({ id: devFxSnapshots.id })
    .from(devFxSnapshots)
    .where(eq(devFxSnapshots.snapshotDate, today))
    .limit(1);
  if (existing.length > 0) {
    return {
      status: "success",
      summary: `Today's snapshot (${today}) already recorded — no-op.`,
      metrics: { inserted: 0, alreadyPresent: 1 },
    };
  }

  // Pull the most recent prior snapshot.
  const prior = await db
    .select()
    .from(devFxSnapshots)
    .orderBy(sql`${devFxSnapshots.snapshotDate} desc`)
    .limit(1);

  if (prior.length === 0) {
    await handle.event("warning", "fx_snapshot_skipped_no_prior", {
      today,
      reason: "no prior snapshot to roll forward from",
    });
    return {
      status: "success",
      summary: "No prior FX snapshot exists — skipping rolled-forward insert.",
      metrics: { inserted: 0, alreadyPresent: 0 },
    };
  }

  const p = prior[0];
  await db.insert(devFxSnapshots).values({
    snapshotDate: today,
    baseCurrency: p.baseCurrency,
    rateIdr: String(p.rateIdr),
    rateRub: p.rateRub ? String(p.rateRub) : null,
    rateEur: p.rateEur ? String(p.rateEur) : null,
    rateUsdt: String(p.rateUsdt),
    rateCny: p.rateCny ? String(p.rateCny) : null,
    source: "custom",
    notes: `Rolled forward from ${String(p.snapshotDate)}`,
  });

  await handle.event("info", "fx_snapshot_rolled_forward", {
    today,
    rolledFrom: String(p.snapshotDate),
  });

  return {
    status: "success",
    summary: `Rolled forward FX rates from ${String(p.snapshotDate)} to ${today}.`,
    metrics: { inserted: 1, alreadyPresent: 0, rolledForward: 1 },
  };
}
