import "server-only";

import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import { recordSecurityEvent } from "@/features/security-baseline/security-events";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * Stage 10.I.6 — Daily trial-status sweep.
 *
 * Finds every org where trial_status='active' AND trial_ends_at < now()
 * and flips them to 'expired'. Idempotent — re-runs are no-ops because
 * already-expired rows are excluded by the WHERE clause.
 *
 * Schedule: daily (vercel.json). Authenticated via CRON_SECRET (Stage
 * 10.G + 8.E.1 cron auth envelope).
 *
 * Side effects per row: a `password_changed`-style audit event with
 * `eventType='login_succeeded'` (no dedicated trial_expired event in
 * the closed SecurityEventType union yet — Stage 10.L will add it
 * alongside the Stripe wiring; for now we surface trial-state changes
 * via this job's metrics + the org row's updated_at).
 */
export async function runTrialStatusJob(_handle: JobRunHandle): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "success",
      summary: "DB not configured — no-op",
      metrics: { expiredCount: 0, skipped: true },
    };
  }

  const cutoff = new Date();
  const expiredRows = await db
    .update(organizations)
    .set({ trialStatus: "expired" })
    .where(
      and(
        eq(organizations.trialStatus, "active"),
        lt(organizations.trialEndsAt, cutoff),
      ),
    )
    .returning({
      id: organizations.id,
      organizationCode: organizations.organizationCode,
      trialEndsAt: organizations.trialEndsAt,
    });

  const expiredCount = expiredRows.length;

  // Best-effort audit log per expired org. Doesn't fail the job on error.
  for (const row of expiredRows) {
    try {
      await recordSecurityEvent({
        eventType: "login_succeeded", // re-using existing union member; see file header
        severity: "info",
        metadata: {
          via: "trial_status_cron",
          organizationId: row.id,
          organizationCode: row.organizationCode,
          previousTrialEndsAt: row.trialEndsAt?.toISOString() ?? null,
          newTrialStatus: "expired",
        },
      });
    } catch {
      // never throw from the audit path
    }
  }

  return {
    status: "success",
    summary: `Expired ${expiredCount} trial${expiredCount === 1 ? "" : "s"}`,
    metrics: {
      expiredCount,
      cutoffIso: cutoff.toISOString(),
    },
  };
}
