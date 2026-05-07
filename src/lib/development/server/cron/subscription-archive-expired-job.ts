import "server-only";

import { and, eq, lte, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  orgSubscriptions,
  subscriptionPlans,
} from "@/lib/db/schema/subscriptions";
import { transitionSubscription } from "@/lib/billing/lifecycle";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 7.C — Subscription archive cron.
 *
 * Daily sweep that moves suspended / cancelled subscriptions to
 * `archived` once `default_archive_after_days` (per plan) has passed
 * since their suspended/cancelled timestamp. Archived rows are hidden
 * from the active UI; the data is preserved until the purge cron
 * removes it.
 */
export async function runSubscriptionArchiveExpired(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();

  const candidates = await db
    .select({
      sub: orgSubscriptions,
      archiveDays: subscriptionPlans.defaultArchiveAfterDays,
    })
    .from(orgSubscriptions)
    .innerJoin(
      subscriptionPlans,
      eq(subscriptionPlans.planCode, orgSubscriptions.planCode),
    )
    .where(sql`${orgSubscriptions.status} IN ('suspended', 'cancelled')`);

  let archived = 0;
  for (const { sub, archiveDays } of candidates) {
    const referenceDate =
      sub.status === "suspended"
        ? sub.suspendedAt
        : sub.cancelledAt;
    if (!referenceDate) continue;
    const archiveAt = new Date(referenceDate);
    archiveAt.setUTCDate(archiveAt.getUTCDate() + archiveDays);
    if (archiveAt > now) continue;

    await transitionSubscription({
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      toStatus: "archived",
      eventType: "archived",
      actorKind: "cron",
      setColumns: { archivedAt: new Date() },
      payload: {
        previousStatus: sub.status,
        archiveDays,
      },
    });
    archived++;
  }

  return {
    status: "success",
    summary: `Archived ${archived} suspended/cancelled subscription(s) past their archive window.`,
    metrics: { archived, scanned: candidates.length },
  };
}

void lte;
