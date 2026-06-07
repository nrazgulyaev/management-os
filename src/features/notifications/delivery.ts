import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import {
  notificationDeliveries,
  notificationPreferences,
  notificationQueue,
  notificationTemplates,
} from "@/lib/db/schema/notifications";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { recordAuditEvent } from "@/features/audit/services";
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

export interface ResolvedRecipient {
  appUserId: string | null;
  ownerId: string | null;
  roleKey: string | null;
  /** email/phone — only set when channel needs an external address. */
  recipientAddress: string | null;
  /** v8B — IANA timezone for quiet-hours evaluation. Falls back to
   *  Asia/Makassar when the recipient row has no timezone (e.g. owners
   *  without a linked app_user). */
  timezone: string;
}

interface QueueRow {
  id: string;
  recipientType: string;
  recipientId: string | null;
  channel: string;
  templateKey: string;
  title: string;
  body: string;
  payload: unknown;
  priority: string;
}

/**
 * Map a queue row to one or more concrete recipients for the chosen
 * channel. The worker calls `selectProvider(channel).send(...)` once per
 * recipient.
 *
 * Today:
 *   - internal_user → resolve email/phone from app_users
 *   - owner         → linked app_users via app_users_owners (channel-aware)
 *   - role          → every active internal app_user with that role
 *   - guest         → skipped for now (returns [] with reason)
 */
export async function resolveNotificationRecipients(
  notification: QueueRow,
): Promise<{ recipients: ResolvedRecipient[]; reason?: string }> {
  const db = getDb();
  if (!db) return { recipients: [], reason: "database unavailable" };

  const channel = notification.channel as DeliveryChannel;
  const recipientType = notification.recipientType as RecipientType;

  if (recipientType === "internal_user") {
    if (!notification.recipientId)
      return { recipients: [], reason: "internal_user without recipient_id" };
    const [user] = await db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        phone: appUsers.phone,
        timezone: appUsers.timezone,
      })
      .from(appUsers)
      .where(eq(appUsers.id, notification.recipientId))
      .limit(1);
    if (!user) return { recipients: [], reason: "app_user not found" };
    return {
      recipients: [
        {
          appUserId: user.id,
          ownerId: null,
          roleKey: null,
          recipientAddress: pickAddressForChannel(channel, user.email, user.phone),
          timezone: user.timezone,
        },
      ],
    };
  }

  if (recipientType === "owner") {
    if (!notification.recipientId)
      return { recipients: [], reason: "owner without recipient_id" };
    // The in_app provider can target the owner directly via owner_id even
    // when there's no linked app_user yet.
    if (channel === "in_app") {
      return {
        recipients: [
          {
            appUserId: null,
            ownerId: notification.recipientId,
            roleKey: null,
            recipientAddress: null,
            timezone: "Asia/Makassar",
          },
        ],
      };
    }
    // For external channels we need a linked app_user with an address.
    const linked = await db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        phone: appUsers.phone,
        timezone: appUsers.timezone,
      })
      .from(appUsersOwners)
      .innerJoin(appUsers, eq(appUsers.id, appUsersOwners.appUserId))
      .where(
        and(
          eq(appUsersOwners.ownerId, notification.recipientId),
          eq(appUsersOwners.status, "active"),
          eq(appUsers.status, "active"),
        ),
      );
    if (linked.length === 0) {
      return { recipients: [], reason: "no linked app_users for owner" };
    }
    return {
      recipients: linked
        .map((u) => ({
          appUserId: u.id,
          ownerId: notification.recipientId,
          roleKey: null,
          recipientAddress: pickAddressForChannel(channel, u.email, u.phone),
          timezone: u.timezone,
        }))
        .filter((r) => r.recipientAddress !== null),
    };
  }

  if (recipientType === "role") {
    const roleKey =
      typeof (notification.payload as Record<string, unknown> | null)?.recipientRole === "string"
        ? ((notification.payload as Record<string, unknown>).recipientRole as string)
        : null;
    if (!roleKey) {
      return { recipients: [], reason: "role recipient missing payload.recipientRole" };
    }
    const users = await db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        phone: appUsers.phone,
        timezone: appUsers.timezone,
      })
      .from(userRoles)
      .innerJoin(appUsers, eq(appUsers.id, userRoles.userId))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(roles.key, roleKey), eq(appUsers.status, "active")));
    if (users.length === 0) {
      return { recipients: [], reason: `no active app_users for role ${roleKey}` };
    }
    return {
      recipients: users.map((u) => ({
        appUserId: u.id,
        ownerId: null,
        roleKey,
        recipientAddress:
          channel === "in_app"
            ? null
            : pickAddressForChannel(channel, u.email, u.phone),
        timezone: u.timezone,
      })),
    };
  }

  if (recipientType === "guest") {
    // External delivery to guests is parked until v8B (the guest portal
    // ships a self-service preference flow). For now, in-app to a linked
    // app_user is impossible (guests don't have one yet); skip cleanly.
    return { recipients: [], reason: "guest delivery deferred to v8B" };
  }

  return { recipients: [], reason: `unknown recipient_type: ${recipientType}` };
}

function pickAddressForChannel(
  channel: DeliveryChannel,
  email: string | null,
  phone: string | null,
): string | null {
  if (channel === "email") return email;
  if (channel === "sms" || channel === "whatsapp") return phone;
  return null;
}

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
  const { recipients, reason: resolveReason } = await resolveNotificationRecipients({
    id: n.id,
    recipientType: n.recipientType,
    recipientId: n.recipientId,
    channel: n.channel,
    templateKey: n.templateKey,
    title: n.title,
    body: n.body,
    payload: n.payload,
    priority: n.priority,
  });

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
