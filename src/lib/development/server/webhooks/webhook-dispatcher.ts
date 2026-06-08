import "server-only";

import { eq, and, lte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  webhookSubscriptions,
  webhookDeliveryLog,
} from "@/lib/db/schema/saas";
import {
  buildSignatureHeader,
  computeNextRetryDelay,
} from "./webhook-helpers";
import { assertPublicUrl } from "@/lib/net/safe-url";

/** Subscriptions get auto-disabled after this many consecutive failures. */
const AUTO_DISABLE_AFTER_FAILURES = 10;
/** Per-attempt HTTP timeout. */
const DELIVERY_TIMEOUT_MS = 10_000;

export interface DispatchResult {
  status: "delivered" | "failed" | "retrying";
  httpStatusCode: number | null;
  durationMs: number;
  errorMessage: string | null;
}

/**
 * Deliver a single queued webhook delivery row. Updates the delivery
 * row + parent subscription with success/failure state and schedules a
 * retry if the attempt failed but attempts remain.
 */
export async function dispatchWebhookDelivery(args: {
  deliveryId: string;
}): Promise<DispatchResult> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      httpStatusCode: null,
      durationMs: 0,
      errorMessage: "DB not configured",
    };
  }

  const deliveryRows = await db
    .select()
    .from(webhookDeliveryLog)
    .where(eq(webhookDeliveryLog.id, args.deliveryId))
    .limit(1);
  const delivery = deliveryRows[0];
  if (!delivery) {
    return {
      status: "failed",
      httpStatusCode: null,
      durationMs: 0,
      errorMessage: "Delivery row not found",
    };
  }

  const subRows = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.id, delivery.webhookSubscriptionId))
    .limit(1);
  const sub = subRows[0];
  if (!sub) {
    await db
      .update(webhookDeliveryLog)
      .set({
        status: "failed",
        errorMessage: "Subscription deleted",
        updatedAt: new Date(),
      })
      .where(eq(webhookDeliveryLog.id, delivery.id));
    return {
      status: "failed",
      httpStatusCode: null,
      durationMs: 0,
      errorMessage: "Subscription deleted",
    };
  }

  if (!sub.isActive) {
    await db
      .update(webhookDeliveryLog)
      .set({
        status: "failed",
        errorMessage: "Subscription inactive",
        updatedAt: new Date(),
      })
      .where(eq(webhookDeliveryLog.id, delivery.id));
    return {
      status: "failed",
      httpStatusCode: null,
      durationMs: 0,
      errorMessage: "Subscription inactive",
    };
  }

  const payload = JSON.stringify({
    id: delivery.eventId,
    type: delivery.eventType,
    organization_id: sub.organizationId,
    created_at: delivery.scheduledAt,
    data: delivery.eventPayload,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildSignatureHeader({
    payload,
    secret: sub.signingSecret,
    timestamp,
  });

  const start = Date.now();
  let httpStatusCode: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      // SSRF guard: re-validate the operator-supplied endpoint at delivery
      // time. Throws SsrfError → caught below → recorded as a failed
      // delivery (counts toward auto-disable), never reaches a private host.
      await assertPublicUrl(sub.endpointUrl);
      const resp = await fetch(sub.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Arconique-Webhooks/1.0",
          "X-Arconique-Event": delivery.eventType,
          "X-Arconique-Event-Id": delivery.eventId,
          "X-Arconique-Signature": signature,
        },
        body: payload,
        signal: controller.signal,
        redirect: "error",
      });
      httpStatusCode = resp.status;
      const text = await resp.text().catch(() => "");
      responseBody = text.length > 4096 ? text.slice(0, 4096) : text;
      success = resp.ok;
      if (!success) {
        errorMessage = `HTTP ${resp.status}`;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    errorMessage =
      e instanceof Error ? e.message : "Network error during delivery";
  }

  const durationMs = Date.now() - start;
  const now = new Date();

  if (success) {
    await db
      .update(webhookDeliveryLog)
      .set({
        status: "delivered",
        httpStatusCode,
        responseBody,
        durationMs,
        deliveredAt: now,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(webhookDeliveryLog.id, delivery.id));
    await db
      .update(webhookSubscriptions)
      .set({
        consecutiveFailures: 0,
        lastSuccessfulDeliveryAt: now,
        lastFailureAt: null,
        lastFailureReason: null,
        updatedAt: now,
      })
      .where(eq(webhookSubscriptions.id, sub.id));
    return {
      status: "delivered",
      httpStatusCode,
      durationMs,
      errorMessage: null,
    };
  }

  // Failure path — schedule retry or mark final failure.
  const retry = computeNextRetryDelay({
    attemptNumber: delivery.attemptNumber,
    maxAttempts: delivery.maxAttempts,
  });
  const nextFailures = sub.consecutiveFailures + 1;
  const nextRetryAt = retry.shouldRetry
    ? new Date(now.getTime() + retry.retryAfterSeconds * 1000)
    : null;

  await db
    .update(webhookDeliveryLog)
    .set({
      status: retry.shouldRetry ? "retrying" : "failed",
      httpStatusCode,
      responseBody,
      durationMs,
      attemptNumber: delivery.attemptNumber + (retry.shouldRetry ? 1 : 0),
      nextRetryAt,
      errorMessage,
      updatedAt: now,
    })
    .where(eq(webhookDeliveryLog.id, delivery.id));

  const subUpdate: Record<string, unknown> = {
    consecutiveFailures: nextFailures,
    lastFailureAt: now,
    lastFailureReason: errorMessage,
    updatedAt: now,
  };
  if (nextFailures >= AUTO_DISABLE_AFTER_FAILURES) {
    subUpdate.isActive = false;
    subUpdate.autoDisabledAt = now;
  }
  await db
    .update(webhookSubscriptions)
    .set(subUpdate as never)
    .where(eq(webhookSubscriptions.id, sub.id));

  return {
    status: retry.shouldRetry ? "retrying" : "failed",
    httpStatusCode,
    durationMs,
    errorMessage,
  };
}

/**
 * Pull due deliveries (pending or retrying with next_retry_at <= now)
 * up to `limit` and dispatch each one. Designed to be called by the
 * `dev_os_webhook_delivery` cron.
 */
export async function dispatchDueDeliveries(args: {
  limit?: number;
} = {}): Promise<{
  scanned: number;
  delivered: number;
  retrying: number;
  failed: number;
}> {
  const db = getDb();
  if (!db) {
    return { scanned: 0, delivered: 0, retrying: 0, failed: 0 };
  }
  const limit = args.limit ?? 100;
  const now = new Date();

  const due = await db
    .select({ id: webhookDeliveryLog.id })
    .from(webhookDeliveryLog)
    .where(
      and(
        inArray(webhookDeliveryLog.status, ["pending", "retrying"]),
        lte(webhookDeliveryLog.nextRetryAt, now),
      ),
    )
    .limit(limit);

  // Also pick up `pending` rows that have NULL next_retry_at (first
  // attempts created by event-emitter without a schedule).
  const firstAttempts = await db
    .select({ id: webhookDeliveryLog.id })
    .from(webhookDeliveryLog)
    .where(eq(webhookDeliveryLog.status, "pending"))
    .limit(limit);

  const ids = Array.from(new Set([...due.map((r) => r.id), ...firstAttempts.map((r) => r.id)]));
  let delivered = 0;
  let retrying = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await dispatchWebhookDelivery({ deliveryId: id });
    if (result.status === "delivered") delivered += 1;
    else if (result.status === "retrying") retrying += 1;
    else failed += 1;
  }
  return { scanned: ids.length, delivered, retrying, failed };
}
