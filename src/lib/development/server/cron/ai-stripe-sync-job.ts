import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { aiOrgUsageMonthly } from "@/lib/db/schema/ai";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P6-CATCHUP — Stripe AI metered-usage sync.
 *
 * **STUB until Stage 7.D activates Stripe subscription products.**
 *
 * Today this job iterates rows in `ai_org_usage_monthly` that have
 * `stripe_subscription_item_id` set, stamps `stripe_synced_at`, and
 * does NOT yet POST to Stripe. The cron contract is preserved so
 * Stage 7.D only needs to swap in the actual `stripe.subscriptionItems.createUsageRecord`
 * call without retrofitting the surrounding plumbing.
 *
 * Stage 7.D will also seed `stripe_subscription_item_id` per org based
 * on the active plan tier (set during checkout).
 */
export async function runAiStripeSync(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const linked = await db
    .select()
    .from(aiOrgUsageMonthly)
    .where(
      and(
        eq(aiOrgUsageMonthly.year, year),
        eq(aiOrgUsageMonthly.month, month),
        isNotNull(aiOrgUsageMonthly.stripeSubscriptionItemId),
      ),
    );

  // STUB: in Stage 7.D, replace this loop with a real Stripe API call.
  // For now we only stamp the timestamp so dashboards show "synced".
  let stamped = 0;
  for (const row of linked) {
    await db
      .update(aiOrgUsageMonthly)
      .set({ stripeSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(aiOrgUsageMonthly.id, row.id));
    stamped++;
  }

  return {
    status: "success",
    summary: `[STUB] Stripe sync: ${linked.length} linked rows, ${stamped} stamped. Activates in Stage 7.D.`,
    metrics: {
      linked: linked.length,
      stamped,
      stub: 1,
    },
  };
}
