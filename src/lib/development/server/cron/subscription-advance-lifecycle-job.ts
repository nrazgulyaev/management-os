import "server-only";

import { and, lte, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { orgSubscriptions } from "@/lib/db/schema/subscriptions";
import { transitionSubscription } from "@/lib/billing/lifecycle";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 7.C — Lifecycle FSM advance cron.
 *
 * Daily sweep that advances overdue subscriptions through the FSM:
 *   - grace -> suspended when grace_period_ends_at has passed
 *   - cancelling -> cancelled when current_period_ends_at has passed
 *
 * Idempotent — only rows whose new state is reachable from the current
 * one are touched.
 */
export async function runSubscriptionAdvanceLifecycle(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();

  // grace -> suspended.
  const overdueGrace = await db
    .select()
    .from(orgSubscriptions)
    .where(
      and(
        sql`${orgSubscriptions.status} = 'grace'`,
        lte(orgSubscriptions.gracePeriodEndsAt, now),
      ),
    );

  let suspended = 0;
  for (const sub of overdueGrace) {
    await transitionSubscription({
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      toStatus: "suspended",
      eventType: "suspended",
      actorKind: "cron",
      setColumns: { suspendedAt: new Date() },
      payload: { gracePeriodEndsAt: sub.gracePeriodEndsAt },
    });
    suspended++;
  }

  // cancelling -> cancelled.
  const overdueCancelling = await db
    .select()
    .from(orgSubscriptions)
    .where(
      and(
        sql`${orgSubscriptions.status} = 'cancelling'`,
        lte(orgSubscriptions.currentPeriodEndsAt, now),
      ),
    );

  let cancelled = 0;
  for (const sub of overdueCancelling) {
    await transitionSubscription({
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      toStatus: "cancelled",
      eventType: "cancelled",
      actorKind: "cron",
      setColumns: { cancelledAt: new Date() },
      payload: { periodEndsAt: sub.currentPeriodEndsAt },
    });
    cancelled++;
  }

  return {
    status: "success",
    summary: `Advanced lifecycle: ${suspended} grace -> suspended, ${cancelled} cancelling -> cancelled.`,
    metrics: { suspended, cancelled },
  };
}
