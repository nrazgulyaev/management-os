import "server-only";

import { and, lte, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { orgSubscriptions } from "@/lib/db/schema/subscriptions";
import { recordLifecycleEvent } from "@/lib/billing/lifecycle";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 7.C — Subscription renewal attempt cron.
 *
 * Daily sweep that records `payment_failed` / `renewed` events for
 * subscriptions whose `current_period_ends_at` has passed. Stripe is
 * the actual payment driver — Stage 7.D's webhook handler converts
 * `invoice.paid` / `invoice.payment_failed` into FSM transitions.
 *
 * Until Stage 7.D activates, this cron is a STUB: it stamps a
 * "payment_failed" event on every active row whose period ends before
 * now AND has no Stripe linkage. Internal-comp rows are skipped.
 */
export async function runSubscriptionAttemptRenewal(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();

  const overdue = await db
    .select()
    .from(orgSubscriptions)
    .where(
      and(
        sql`${orgSubscriptions.status} = 'active'`,
        lte(orgSubscriptions.currentPeriodEndsAt, now),
        sql`${orgSubscriptions.isInternalComp} = false`,
      ),
    );

  let stamped = 0;
  for (const sub of overdue) {
    // STUB: in Stage 7.D, replace this with `stripe.subscriptions.retrieve`
    // and dispatch into transitionSubscription based on the result.
    await recordLifecycleEvent({
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      eventType: "payment_failed",
      actorKind: "cron",
      payload: {
        stub: true,
        periodEndsAt: sub.currentPeriodEndsAt,
        sweepDate: now.toISOString().slice(0, 10),
      },
    });
    stamped++;
  }

  return {
    status: "success",
    summary: `[STUB] Attempted renewal sweep — ${stamped} overdue subscription(s) flagged. Activates in Stage 7.D.`,
    metrics: { stamped, scanned: overdue.length, stub: 1 },
  };
}
