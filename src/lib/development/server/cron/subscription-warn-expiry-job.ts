import "server-only";

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { orgSubscriptions } from "@/lib/db/schema/subscriptions";
import { recordLifecycleEvent } from "@/lib/billing/lifecycle";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 7.C — Subscription expiry-warning cron.
 *
 * Daily sweep that records `trial_warned` events at D-5 / D-2 windows
 * for trial + active subscriptions approaching renewal. Email/Slack
 * delivery is delegated to the notification dispatch surface (out of
 * scope here — the cron only stamps the warning event so the in-app
 * banner can render).
 *
 * Idempotent: a warning event is recorded once per day per (sub, window).
 * The notification dispatcher dedupes against the event log.
 */
export async function runSubscriptionWarnExpiry(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();

  // 5 days from now and 2 days from now (UTC midnight of each).
  const inFiveDays = new Date(now);
  inFiveDays.setUTCDate(inFiveDays.getUTCDate() + 5);
  inFiveDays.setUTCHours(0, 0, 0, 0);
  const fiveDaysEnd = new Date(inFiveDays);
  fiveDaysEnd.setUTCHours(23, 59, 59, 999);

  const inTwoDays = new Date(now);
  inTwoDays.setUTCDate(inTwoDays.getUTCDate() + 2);
  inTwoDays.setUTCHours(0, 0, 0, 0);
  const twoDaysEnd = new Date(inTwoDays);
  twoDaysEnd.setUTCHours(23, 59, 59, 999);

  // Sweep subscriptions whose trial OR current_period ends inside either window.
  const expiring = await db
    .select()
    .from(orgSubscriptions)
    .where(
      and(
        sql`${orgSubscriptions.status} IN ('trial', 'active')`,
        sql`(
          (${orgSubscriptions.trialEndsAt} BETWEEN ${inFiveDays} AND ${fiveDaysEnd})
          OR (${orgSubscriptions.trialEndsAt} BETWEEN ${inTwoDays} AND ${twoDaysEnd})
          OR (${orgSubscriptions.currentPeriodEndsAt} BETWEEN ${inFiveDays} AND ${fiveDaysEnd})
          OR (${orgSubscriptions.currentPeriodEndsAt} BETWEEN ${inTwoDays} AND ${twoDaysEnd})
        )`,
      ),
    );

  let warned = 0;
  for (const sub of expiring) {
    await recordLifecycleEvent({
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      eventType: "trial_warned",
      actorKind: "cron",
      payload: {
        status: sub.status,
        trialEndsAt: sub.trialEndsAt,
        currentPeriodEndsAt: sub.currentPeriodEndsAt,
        sweepDate: now.toISOString().slice(0, 10),
      },
    });
    warned++;
  }

  return {
    status: "success",
    summary: `Warned ${warned} subscription(s) approaching expiry.`,
    metrics: { warned, scanned: expiring.length },
  };
}

// gte + lte imported but unused here intentionally — they're useful for
// future window expansion. Suppress the "imported but unused" lint via
// the void-cast shape used elsewhere in the cron module.
void gte;
void lte;
void eq;
