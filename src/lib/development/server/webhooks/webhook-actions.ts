"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  webhookSubscriptions,
  webhookDeliveryLog,
} from "@/lib/db/schema/saas";
import { generateSigningSecret } from "./webhook-helpers";
import { dispatchWebhookDelivery } from "./webhook-dispatcher";

const subscribeSchema = z.object({
  organizationId: z.string().uuid(),
  webhookLabel: z.string().min(2).max(120),
  endpointUrl: z.string().url(),
  subscribedEvents: z.array(z.string().min(1)).min(1),
  createdBy: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Subscribe an endpoint to a set of events. Generates a fresh signing
 * secret — returned ONCE so the integrator can store it. The DB stores
 * the same secret for HMAC signing of outbound deliveries.
 */
export async function subscribeWebhook(input: z.input<typeof subscribeSchema>) {
  const parsed = subscribeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };

  const signingSecret = generateSigningSecret();
  const inserted = await db
    .insert(webhookSubscriptions)
    .values({
      organizationId: parsed.data.organizationId,
      webhookLabel: parsed.data.webhookLabel,
      endpointUrl: parsed.data.endpointUrl,
      signingSecret,
      subscribedEvents: parsed.data.subscribedEvents,
      createdBy: parsed.data.createdBy ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning({ id: webhookSubscriptions.id });
  return {
    ok: true as const,
    subscriptionId: inserted[0].id,
    signingSecret,
  };
}

export async function unsubscribeWebhook(args: {
  subscriptionId: string;
  reason?: string;
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(webhookSubscriptions)
    .set({
      isActive: false,
      autoDisabledAt: new Date(),
      lastFailureReason: args.reason ?? "manually unsubscribed",
    })
    .where(eq(webhookSubscriptions.id, args.subscriptionId));
  return { ok: true as const };
}

export async function rotateSigningSecret(args: { subscriptionId: string }) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const next = generateSigningSecret();
  await db
    .update(webhookSubscriptions)
    .set({ signingSecret: next, updatedAt: new Date() })
    .where(eq(webhookSubscriptions.id, args.subscriptionId));
  return { ok: true as const, signingSecret: next };
}

/**
 * Fire a test event to a subscription's endpoint. Inserts a delivery
 * row with `event_type = "test.ping"` and immediately attempts delivery
 * (synchronous) so the UI can show the result.
 */
export async function testFireWebhook(args: { subscriptionId: string }) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const subRows = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.id, args.subscriptionId))
    .limit(1);
  const sub = subRows[0];
  if (!sub) return { ok: false as const, error: "Subscription not found" };
  if (!sub.isActive) {
    return { ok: false as const, error: "Subscription is inactive" };
  }

  const payload = {
    event: "test.ping",
    organizationId: sub.organizationId,
    sentAt: new Date().toISOString(),
    message: "Arconique webhook test fire",
  };

  const inserted = await db
    .insert(webhookDeliveryLog)
    .values({
      webhookSubscriptionId: sub.id,
      eventType: "test.ping",
      eventId: crypto.randomUUID(),
      eventPayload: payload as never,
      status: "pending",
    })
    .returning({ id: webhookDeliveryLog.id });

  const deliveryId = inserted[0].id;
  const result = await dispatchWebhookDelivery({ deliveryId });
  return { ok: true as const, deliveryId, result };
}
