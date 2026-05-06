import "server-only";

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  webhookSubscriptions,
  webhookDeliveryLog,
} from "@/lib/db/schema/saas";

export async function listWebhookSubscriptions(organizationId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.organizationId, organizationId))
    .orderBy(desc(webhookSubscriptions.createdAt));
}

export async function listActiveSubscriptionsForEvent(
  organizationId: string,
  eventType: string,
) {
  const db = getDb();
  if (!db) return [];
  // Pull all active subs and filter event match in JS — simpler than
  // array overlap operators for the wildcard case.
  const rows = await db
    .select()
    .from(webhookSubscriptions)
    .where(
      and(
        eq(webhookSubscriptions.organizationId, organizationId),
        eq(webhookSubscriptions.isActive, true),
      ),
    );
  return rows.filter((s) => {
    const events = s.subscribedEvents ?? [];
    if (events.includes("*")) return true;
    if (events.includes(eventType)) return true;
    return events.some(
      (e) => e.endsWith(".*") && eventType.startsWith(e.slice(0, -2) + "."),
    );
  });
}

export async function getWebhookSubscriptionById(id: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listDeliveryLogForSubscription(
  subscriptionId: string,
  limit = 50,
) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(webhookDeliveryLog)
    .where(eq(webhookDeliveryLog.webhookSubscriptionId, subscriptionId))
    .orderBy(desc(webhookDeliveryLog.scheduledAt))
    .limit(limit);
}
