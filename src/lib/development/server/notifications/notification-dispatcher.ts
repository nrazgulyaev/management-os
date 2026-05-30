import "server-only";

import webpush from "web-push";
import { eq, sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import {
  notificationDispatchLog,
  pushSubscriptions,
} from "@/lib/db/schema/pwa";
import { getVapidKeys } from "../push/vapid-keys";
import { classifyDeliveryFailure } from "../push/dispatch-helpers";

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const keys = getVapidKeys();
  if (!keys) return false;
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  vapidConfigured = true;
  return true;
}

export interface DispatchResult {
  delivered: number;
  failed: number;
  unsubscribed: number;
  dryRun: boolean;
}

/**
 * Dispatch all `pending` rows in `notification_dispatch_log` whose
 * `scheduled_at <= now()`. Falls into dry-run mode when VAPID keys
 * are not configured — log rows are still updated to `dry_run` so the
 * pending queue doesn't grow unbounded.
 */
export async function dispatchPendingNotifications(): Promise<DispatchResult> {
  const db = getDb();
  if (!db) {
    return { delivered: 0, failed: 0, unsubscribed: 0, dryRun: true };
  }

  const configured = ensureVapidConfigured();
  const dryRun = !configured;

  const pendingResult = await db.execute<{
    id: string;
    title: string;
    body: string;
    data_payload: unknown;
    target_subscription_id: string | null;
  }>(sql`
    SELECT id::text, title, body, data_payload,
           target_subscription_id::text
      FROM notification_dispatch_log
     WHERE dispatch_status = 'pending'
       AND scheduled_at <= now()
     ORDER BY scheduled_at
     LIMIT 200
  `);
  const pending =
    rowsOf<{
        id: string;
        title: string;
        body: string;
        data_payload: unknown;
        target_subscription_id: string | null;
      }>(pendingResult);

  let delivered = 0;
  let failed = 0;
  let unsubscribed = 0;

  for (const row of pending) {
    if (dryRun) {
      await db
        .update(notificationDispatchLog)
        .set({
          dispatchStatus: "dispatched",
          dispatchedAt: new Date(),
          notes: "dry_run: VAPID keys not configured",
        })
        .where(eq(notificationDispatchLog.id, row.id));
      delivered++;
      continue;
    }

    if (!row.target_subscription_id) {
      await db
        .update(notificationDispatchLog)
        .set({
          dispatchStatus: "failed",
          failedAt: new Date(),
          failureReason: "no target subscription",
        })
        .where(eq(notificationDispatchLog.id, row.id));
      failed++;
      continue;
    }

    const subRows = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.id, row.target_subscription_id))
      .limit(1);
    const sub = subRows[0];
    if (!sub || !sub.isActive) {
      await db
        .update(notificationDispatchLog)
        .set({
          dispatchStatus: "failed",
          failedAt: new Date(),
          failureReason: "subscription inactive or missing",
        })
        .where(eq(notificationDispatchLog.id, row.id));
      failed++;
      continue;
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
        },
        JSON.stringify({
          title: row.title,
          body: row.body,
          data: row.data_payload,
        }),
      );
      await db
        .update(notificationDispatchLog)
        .set({
          dispatchStatus: "delivered",
          dispatchedAt: new Date(),
          deliveredAt: new Date(),
        })
        .where(eq(notificationDispatchLog.id, row.id));
      await db
        .update(pushSubscriptions)
        .set({
          consecutiveFailures: 0,
          lastSuccessfulDeliveryAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, sub.id));
      delivered++;
    } catch (e) {
      const status =
        (e as { statusCode?: number })?.statusCode ?? 500;
      const action = classifyDeliveryFailure(status);
      const reason =
        (e as Error)?.message ?? `HTTP ${status} from push endpoint`;
      await db
        .update(notificationDispatchLog)
        .set({
          dispatchStatus: "failed",
          failedAt: new Date(),
          failureReason: reason,
        })
        .where(eq(notificationDispatchLog.id, row.id));
      if (action === "unsubscribe_immediately") {
        await db
          .update(pushSubscriptions)
          .set({
            isActive: false,
            unsubscribedAt: new Date(),
            lastFailureAt: new Date(),
            lastFailureReason: reason,
          })
          .where(eq(pushSubscriptions.id, sub.id));
        unsubscribed++;
      } else {
        await db
          .update(pushSubscriptions)
          .set({
            consecutiveFailures: sql`${pushSubscriptions.consecutiveFailures} + 1`,
            lastFailureAt: new Date(),
            lastFailureReason: reason,
          })
          .where(eq(pushSubscriptions.id, sub.id));
      }
      failed++;
    }
  }

  return { delivered, failed, unsubscribed, dryRun };
}
