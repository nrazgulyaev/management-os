import "server-only";

import { eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  orgSubscriptions,
  subscriptionPlans,
} from "@/lib/db/schema/subscriptions";
import { transitionSubscription } from "@/lib/billing/lifecycle";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 7.C — Subscription purge cron.
 *
 * Final stage of the FSM. Moves archived subscriptions to `purged` once
 * `default_purge_after_days` has elapsed since `archived_at`. Purge is
 * IRREVERSIBLE — the row is left in place as a tombstone but the
 * organization's data is dropped by a sibling cleanup job (out of scope
 * here; the data-export team owns the actual data deletion job).
 *
 * Safety lock: the cron refuses to purge if more than 5% of all
 * archived rows would be touched in a single run. Operators can
 * raise the cap manually or trigger a one-shot via the dispatcher.
 */
const PURGE_BATCH_SAFETY_PCT = 5;

export async function runSubscriptionPurgeArchived(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();

  const candidates = await db
    .select({
      sub: orgSubscriptions,
      purgeDays: subscriptionPlans.defaultPurgeAfterDays,
    })
    .from(orgSubscriptions)
    .innerJoin(
      subscriptionPlans,
      eq(subscriptionPlans.planCode, orgSubscriptions.planCode),
    )
    .where(sql`${orgSubscriptions.status} = 'archived'`);

  // Filter to rows whose archive window has passed.
  const eligible = candidates.filter(({ sub, purgeDays }) => {
    if (!sub.archivedAt) return false;
    const purgeAt = new Date(sub.archivedAt);
    purgeAt.setUTCDate(purgeAt.getUTCDate() + purgeDays);
    return purgeAt <= now;
  });

  if (eligible.length === 0) {
    return {
      status: "success",
      summary: "No subscriptions eligible for purge.",
      metrics: { purged: 0, scanned: candidates.length },
    };
  }

  // Safety: refuse if eligible count exceeds 5% of all archived rows.
  if (
    candidates.length > 0 &&
    (eligible.length / candidates.length) * 100 > PURGE_BATCH_SAFETY_PCT
  ) {
    return {
      status: "skipped",
      summary: `Refused to purge — eligible (${eligible.length}/${candidates.length}) > ${PURGE_BATCH_SAFETY_PCT}% safety threshold. Manual review required.`,
      metrics: {
        purged: 0,
        eligible: eligible.length,
        scanned: candidates.length,
        safety_blocked: 1,
      },
    };
  }

  let purged = 0;
  for (const { sub } of eligible) {
    await transitionSubscription({
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      toStatus: "purged",
      eventType: "purged",
      actorKind: "cron",
      setColumns: { purgedAt: new Date() },
      payload: { archivedAt: sub.archivedAt },
    });
    purged++;
  }

  return {
    status: "success",
    summary: `Purged ${purged} archived subscription(s).`,
    metrics: { purged, scanned: candidates.length },
  };
}
