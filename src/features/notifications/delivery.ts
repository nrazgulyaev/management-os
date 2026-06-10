import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import {
  notificationDeliveries,
  notificationPreferences,
  notificationQueue,
  notificationTemplates,
} from "@/lib/db/schema/notifications";
import { recordAuditEvent } from "@/features/audit/services";
import { logger } from "@/lib/observability/logger";
import { selectProvider } from "./providers";
import type {
  DeliveryChannel,
  DeliveryInput,
  DeliveryResult,
  RecipientType,
} from "./providers/types";
import { isWithinQuietHours, nextQuietHoursEnd } from "./quiet-hours";
import { computeNextRetryAt } from "./retry";
import {
  chooseDeliveryContent,
  renderTemplate,
  type NotificationTemplate,
} from "./templates";

// -----------------------------------------------------------------------------
// Recipient resolution
// -----------------------------------------------------------------------------
// TENANCY (wave 4 fix) — recipient resolution lives in ./recipients (a
// module without `import "server-only"` so node:test can exercise the
// org-scoping). The worker injects its Drizzle client below; the resolver
// constrains role fan-out + direct targets to the queue row's org.

import { resolveNotificationRecipients } from "./recipients";

export { resolveNotificationRecipients };
export type { ResolvedRecipient, RecipientQueueRow } from "./recipients";

// -----------------------------------------------------------------------------
// Preferences
// -----------------------------------------------------------------------------

interface PreferenceLookupKeys {
  appUserId: string | null;
  ownerId: string | null;
  roleKey: string | null;
  channel: string;
  templateKey: string;
}

/**
 * Load the most-specific preference matching the recipient + channel + template.
 * Specificity order: app_user > owner > role > global (no scope set).
 */
export async function loadEffectivePreference(
  keys: PreferenceLookupKeys,
): Promise<typeof notificationPreferences.$inferSelect | null> {
  const db = getDb();
  if (!db) return null;

  const candidates = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.channel, keys.channel),
        eq(notificationPreferences.templateKey, keys.templateKey),
      ),
    );

  // Pick the most specific row that applies. A preference applies when its
  // scope columns either match the recipient or are NULL.
  const ranked = candidates
    .map((row) => {
      let score = 0;
      if (row.appUserId) {
        if (row.appUserId !== keys.appUserId) return null;
        score += 4;
      }
      if (row.ownerId) {
        if (row.ownerId !== keys.ownerId) return null;
        score += 2;
      }
      if (row.roleKey) {
        if (row.roleKey !== keys.roleKey) return null;
        score += 1;
      }
      return { row, score };
    })
    .filter((x): x is { row: typeof notificationPreferences.$inferSelect; score: number } =>
      x !== null,
    )
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.row ?? null;
}

export interface SuppressDecision {
  suppress: boolean;
  reason?: string;
  reschedule?: Date;
}

export function shouldSuppressByPreference(
  pref: typeof notificationPreferences.$inferSelect | null,
  now: Date = new Date(),
  timezone: string = "Asia/Makassar",
): SuppressDecision {
  if (!pref) return { suppress: false };
  if (!pref.enabled)
    return { suppress: true, reason: "disabled by preference" };
  if (
    isWithinQuietHours(
      {
        quietHoursStart: pref.quietHoursStart,
        quietHoursEnd: pref.quietHoursEnd,
      },
      now,
      timezone,
    )
  ) {
    const end = nextQuietHoursEnd(
      {
        quietHoursStart: pref.quietHoursStart,
        quietHoursEnd: pref.quietHoursEnd,
      },
      now,
      timezone,
    );
    return {
      suppress: true,
      reason: "within quiet hours",
      reschedule: end ?? undefined,
    };
  }
  return { suppress: false };
}

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------

/**
 * Load the active template for a (templateKey, channel) pair. Returns
 * null when no row matches — callers fall back to the queued title/body.
 */
export async function loadActiveTemplate(
  templateKey: string,
  channel: string,
): Promise<NotificationTemplate | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      templateKey: notificationTemplates.templateKey,
      channel: notificationTemplates.channel,
      subjectTemplate: notificationTemplates.subjectTemplate,
      bodyTemplate: notificationTemplates.bodyTemplate,
      htmlTemplate: notificationTemplates.htmlTemplate,
    })
    .from(notificationTemplates)
    .where(
      and(
        eq(notificationTemplates.templateKey, templateKey),
        eq(notificationTemplates.channel, channel),
        eq(notificationTemplates.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

// -----------------------------------------------------------------------------
// Delivery — inserts notification_deliveries rows + advances queue status
// -----------------------------------------------------------------------------

export interface DeliverNotificationOutcome {
  notificationId: string;
  deliveriesCreated: number;
  sent: number;
  failed: number;
  skipped: number;
  suppressed: number;
  rescheduledFor?: string;
  finalStatus: "sent" | "failed" | "queued" | "suppressed";
}

/**
 * Process a single queued notification end-to-end.
 *  1. Resolve recipients for the channel.
 *  2. For each recipient: check preferences → call provider → record
 *     `notification_deliveries` row.
 *  3. Aggregate: if all deliveries sent / suppressed / skipped, mark queue
 *     `sent`. If any failed and nothing else succeeded, mark `failed`.
 *  4. Bump `delivery_attempts` + `last_attempted_at`.
 */
export async function deliverNotification(
  notificationId: string,
): Promise<DeliverNotificationOutcome> {
  const db = getDb();
  if (!db) {
    return {
      notificationId,
      deliveriesCreated: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      suppressed: 0,
      finalStatus: "queued",
    };
  }

  const [n] = await db
    .select()
    .from(notificationQueue)
    .where(eq(notificationQueue.id, notificationId))
    .limit(1);
  if (!n) {
    return {
      notificationId,
      deliveriesCreated: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      suppressed: 0,
      finalStatus: "failed",
    };
  }

  const now = new Date();
  const channel = n.channel as DeliveryChannel;

  // Resolve recipients for the channel.
  const { recipients, reason: resolveReason } = await resolveNotificationRecipients(
    {
      id: n.id,
      recipientType: n.recipientType,
      recipientId: n.recipientId,
      // TENANCY — thread the queue row's org into recipient resolution so
      // role fan-out and direct targets stay inside the org.
      organizationId: n.organizationId,
      channel: n.channel,
      templateKey: n.templateKey,
      title: n.title,
      body: n.body,
      payload: n.payload,
      priority: n.priority,
    },
    db,
  );

  const provider = selectProvider(channel);
  // v8B — pre-render template once per queue row. Template lookup is by
  // (templateKey, channel) so all recipients see the same wording; only
  // payload variables come from the queue row itself.
  const template = await loadActiveTemplate(n.templateKey, channel);
  const rendered = template
    ? renderTemplate(template, (n.payload as Record<string, unknown>) ?? null)
    : null;

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let suppressed = 0;
  let deliveriesCreated = 0;
  let nextAttemptAt: Date | null = null;

  if (recipients.length === 0) {
    // No one to deliver to — record a single skipped delivery row so the
    // operator sees the reason in the admin log.
    await db.insert(notificationDeliveries).values({
      // TENANCY-FINANCE-DOCS — copy the parent queue row's org.
      organizationId: n.organizationId,
      notificationId: n.id,
      channel,
      provider: provider.key,
      status: "skipped",
      attemptedAt: now,
      errorMessage: resolveReason ?? "no recipients resolved",
    });
    deliveriesCreated++;
    skipped++;
  } else {
    for (const r of recipients) {
      const pref = await loadEffectivePreference({
        appUserId: r.appUserId,
        ownerId: r.ownerId,
        roleKey: r.roleKey,
        channel,
        templateKey: n.templateKey,
      });
      const decision = shouldSuppressByPreference(pref, now, r.timezone);
      if (decision.suppress) {
        await db.insert(notificationDeliveries).values({
          // TENANCY-FINANCE-DOCS — copy the parent queue row's org.
          organizationId: n.organizationId,
          notificationId: n.id,
          channel,
          provider: provider.key,
          recipientAddress: r.recipientAddress,
          status: "suppressed",
          attemptedAt: now,
          errorMessage: decision.reason ?? "suppressed",
        });
        deliveriesCreated++;
        suppressed++;
        if (decision.reschedule) {
          if (!nextAttemptAt || decision.reschedule < nextAttemptAt) {
            nextAttemptAt = decision.reschedule;
          }
        }
        continue;
      }

      const content = chooseDeliveryContent(
        { title: n.title, body: n.body },
        rendered,
      );
      const input: DeliveryInput = {
        notificationId: n.id,
        organizationId: n.organizationId,
        channel,
        recipientType: n.recipientType as RecipientType,
        recipientId: r.appUserId ?? r.ownerId ?? null,
        recipientAddress: r.recipientAddress,
        title: content.title,
        body: content.body,
        html: content.html,
        payload: n.payload as Record<string, unknown> | null,
        priority: n.priority as DeliveryInput["priority"],
        appUserId: r.appUserId,
        ownerId: r.ownerId,
        roleKey: r.roleKey,
        templateKey: n.templateKey,
      };

      let result: DeliveryResult;
      try {
        result = await provider.send(input);
      } catch (e) {
        result = {
          status: "failed",
          errorMessage: e instanceof Error ? e.message : "provider threw",
        };
      }

      await db.insert(notificationDeliveries).values({
        // TENANCY-FINANCE-DOCS — copy the parent queue row's org.
        organizationId: n.organizationId,
        notificationId: n.id,
        channel,
        provider: provider.key,
        recipientAddress: r.recipientAddress,
        status: result.status,
        providerMessageId: result.providerMessageId ?? null,
        attemptedAt: now,
        sentAt: result.status === "sent" ? now : null,
        failedAt: result.status === "failed" ? now : null,
        errorMessage: result.errorMessage ?? null,
        responseJson: (result.responseJson ??
          null) as typeof notificationDeliveries.$inferInsert["responseJson"],
      });
      deliveriesCreated++;

      if (result.status === "sent") sent++;
      else if (result.status === "failed") failed++;
      else if (result.status === "skipped") skipped++;
      else if (result.status === "suppressed") suppressed++;
    }
  }

  // Aggregate — what status does the queue row land on?
  const successful = sent + suppressed + skipped;
  let finalStatus: DeliverNotificationOutcome["finalStatus"];
  let queueUpdate: Partial<typeof notificationQueue.$inferInsert> = {
    deliveryAttempts: (n.deliveryAttempts ?? 0) + 1,
    lastAttemptedAt: now,
  };
  if (recipients.length === 0) {
    // Nothing to deliver — leave queued so retries don't pile up; also
    // ensures dedupe_key keeps the row around for inspection. Mark
    // `suppressed` only when we actually have a recipient.
    finalStatus = "failed";
    queueUpdate = {
      ...queueUpdate,
      status: "failed",
      failedAt: now,
      errorMessage: resolveReason ?? "no recipients",
    };
  } else if (failed > 0 && successful === 0) {
    // v8B — retry-backoff schedule: 30s / 5m / 30m capped at max_attempts.
    // `deliveryAttempts` is the count *before* this attempt; the run we
    // just finished pushes it to `attemptsAfter`. computeNextRetryAt
    // returns null once we've exhausted retries.
    const attemptsAfter = (n.deliveryAttempts ?? 0) + 1;
    const maxAttempts = n.maxAttempts ?? 3;
    const retryAt = computeNextRetryAt(attemptsAfter, maxAttempts, now);
    if (retryAt) {
      finalStatus = "queued";
      queueUpdate = {
        ...queueUpdate,
        status: "queued",
        nextAttemptAt: retryAt,
        errorMessage: "delivery failed — scheduled for retry",
      };
      nextAttemptAt = retryAt;
    } else {
      finalStatus = "failed";
      queueUpdate = {
        ...queueUpdate,
        status: "failed",
        failedAt: now,
        errorMessage: "all delivery attempts failed",
      };
    }
  } else if (sent > 0) {
    finalStatus = "sent";
    queueUpdate = { ...queueUpdate, status: "sent", sentAt: now };
  } else if (suppressed > 0 && failed === 0) {
    // Everything got suppressed (quiet hours / disabled). Re-queue at the
    // earliest reschedule we collected; if none, leave `queued` for a
    // manual operator action.
    if (nextAttemptAt) {
      finalStatus = "queued";
      queueUpdate = { ...queueUpdate, nextAttemptAt };
    } else {
      finalStatus = "suppressed";
      queueUpdate = { ...queueUpdate, status: "suppressed" };
    }
  } else {
    finalStatus = "queued";
  }

  await db
    .update(notificationQueue)
    .set(queueUpdate)
    .where(eq(notificationQueue.id, n.id));

  await recordAuditEvent({
    actorUserId: null,
    action: `notification.delivery.${finalStatus}`,
    entityType: "notification_queue",
    entityId: n.id,
    after: { sent, failed, skipped, suppressed, deliveriesCreated },
  });

  // OBSERVABILITY-SPINE-H — notification-failure alerting. When an envelope
  // ends `failed` (provider rejected every recipient and retries are
  // exhausted, or there was nobody to deliver to), emit a structured error
  // log. The logger forwards warn/error to Sentry/Logtail when a DSN is set,
  // so a silent delivery dead-letter now raises a visible alert instead of
  // only landing in the audit trail. Note: queue rows that merely scheduled
  // a retry stay `queued` and do NOT alert — only terminal failures do.
  if (finalStatus === "failed") {
    logger.error("Notification delivery failed", {
      area: "notifications.delivery",
      notificationId: n.id,
      channel: n.channel,
      templateKey: n.templateKey,
      recipientType: n.recipientType,
      sent,
      failed,
      skipped,
      suppressed,
      deliveriesCreated,
    });
  }

  return {
    notificationId: n.id,
    deliveriesCreated,
    sent,
    failed,
    skipped,
    suppressed,
    rescheduledFor: nextAttemptAt?.toISOString(),
    finalStatus,
  };
}

// -----------------------------------------------------------------------------
// Batch
// -----------------------------------------------------------------------------

export interface DeliverPendingMetrics {
  notificationsChecked: number;
  deliveriesCreated: number;
  sent: number;
  failed: number;
  skipped: number;
  suppressed: number;
  retriesScheduled: number;
}

export async function deliverPendingNotifications(
  limit = 100,
): Promise<DeliverPendingMetrics> {
  const db = getDb();
  if (!db) {
    return {
      notificationsChecked: 0,
      deliveriesCreated: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      suppressed: 0,
      retriesScheduled: 0,
    };
  }

  const now = new Date();
  // Prompt 111 — claim queued rows with `FOR UPDATE SKIP LOCKED` so
  // parallel workers cannot pick the same row.  Status is flipped to
  // `processing` inside the same transaction; the row is then released
  // when the transaction commits but `processing` keeps any other
  // worker from re-selecting it.  Each row's actual delivery (provider
  // call) happens outside the transaction so the lock window stays
  // short.
  const rows = await db.transaction(async (tx) => {
    const claimed = await tx.execute<{ id: string }>(
      sql`SELECT id FROM "notification_queue"
           WHERE status = 'queued'
             AND (scheduled_for IS NULL OR scheduled_for <= ${now})
             AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
           ORDER BY created_at ASC
           LIMIT ${limit}
           FOR UPDATE SKIP LOCKED`,
    );
    const claimedRows = rowsOf<{ id: string }>(claimed);
    if (claimedRows.length > 0) {
      await tx.execute(
        sql`UPDATE "notification_queue"
              SET status = 'processing', updated_at = ${now}
            WHERE id IN (${sql.join(
              claimedRows.map((r) => sql`${r.id}::uuid`),
              sql`, `,
            )})`,
      );
    }
    return claimedRows;
  });

  let deliveriesCreated = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let suppressed = 0;
  let retriesScheduled = 0;

  for (const row of rows) {
    const out = await deliverNotification(row.id);
    deliveriesCreated += out.deliveriesCreated;
    sent += out.sent;
    failed += out.failed;
    skipped += out.skipped;
    suppressed += out.suppressed;
    if (out.rescheduledFor) retriesScheduled++;
  }

  return {
    notificationsChecked: rows.length,
    deliveriesCreated,
    sent,
    failed,
    skipped,
    suppressed,
    retriesScheduled,
  };
}

/** Reset a notification back to queued so the worker picks it up again. */
export async function requeueNotification(
  notificationId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "db unavailable" };
  const [row] = await db
    .select()
    .from(notificationQueue)
    .where(eq(notificationQueue.id, notificationId))
    .limit(1);
  if (!row) return { ok: false, reason: "not found" };
  await db
    .update(notificationQueue)
    .set({
      status: "queued",
      sentAt: null,
      failedAt: null,
      errorMessage: null,
      nextAttemptAt: null,
    })
    .where(eq(notificationQueue.id, notificationId));
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Inbox helpers (used by the topbar count + inbox page)
// -----------------------------------------------------------------------------

export async function countUnreadInboxForAppUser(appUserId: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(
      sql`in_app_notifications`,
    )
    .where(
      sql`app_user_id = ${appUserId} AND status = 'unread'`,
    );
  return Number(row?.c ?? 0);
}

/** Bulk fetch the most recent `limit` open queue rows (for the dashboard). */
export async function listQueueIdsForRetry(limit = 50): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: notificationQueue.id })
    .from(notificationQueue)
    .where(inArray(notificationQueue.status, ["failed"]))
    .limit(limit);
  return rows.map((r) => r.id);
}
