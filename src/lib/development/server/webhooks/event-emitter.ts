import "server-only";

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { webhookDeliveryLog } from "@/lib/db/schema/saas";
import { listActiveSubscriptionsForEvent } from "./webhook-queries";

/**
 * Stage 5.J — central event emitter.
 *
 * Called from any action that produces a webhook-worthy event (project
 * created, lead captured, transaction settled, etc.). For each matching
 * active subscription we insert a `pending` delivery row. The
 * `dev_os_webhook_delivery` cron picks the rows up and dispatches them.
 *
 * Fire-and-forget: this function never throws. Webhook subscribers are
 * external — a misconfigured endpoint must not break the originating
 * action.
 */
export async function emitEvent(args: {
  organizationId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<{ subscriptionsMatched: number; deliveriesQueued: number }> {
  try {
    const db = getDb();
    if (!db) return { subscriptionsMatched: 0, deliveriesQueued: 0 };

    const subs = await listActiveSubscriptionsForEvent(
      args.organizationId,
      args.eventType,
    );
    if (subs.length === 0) {
      return { subscriptionsMatched: 0, deliveriesQueued: 0 };
    }

    const eventId = randomUUID();
    const rows = subs.map((s) => ({
      webhookSubscriptionId: s.id,
      eventType: args.eventType,
      eventId,
      eventPayload: args.payload as never,
      status: "pending" as const,
    }));

    const inserted = await db
      .insert(webhookDeliveryLog)
      .values(rows)
      .returning({ id: webhookDeliveryLog.id });

    return {
      subscriptionsMatched: subs.length,
      deliveriesQueued: inserted.length,
    };
  } catch {
    // Swallow — webhooks must never break the calling action.
    return { subscriptionsMatched: 0, deliveriesQueued: 0 };
  }
}
