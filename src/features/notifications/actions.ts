"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  inAppNotifications,
  notificationPreferences,
  notificationQueue,
} from "@/lib/db/schema/notifications";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  notificationIdSchema,
  updateNotificationPreferenceSchema,
} from "./schema";
import {
  deliverNotification,
  deliverPendingNotifications,
  requeueNotification,
} from "./delivery";
import { isInboxRowVisibleToCurrentOwner } from "./services";
import { runNotificationDigestJob } from "@/features/jobs/notification-digest-job";
import { startJobRun, finishJobRun } from "@/features/jobs/runner";
import type { ActionResult } from "@/features/projects/actions";

export async function markNotificationSentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("notifications.manage");
  const parsed = notificationIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing notification id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [before] = await db
    .select()
    .from(notificationQueue)
    .where(eq(notificationQueue.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Notification not found." };

  await db
    .update(notificationQueue)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(notificationQueue.id, parsed.data.id));

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "notifications.mark_sent",
    entityType: "notification_queue",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "sent" },
  });

  revalidatePath("/dashboard/notifications");
  return { ok: true };
}

export async function markNotificationFailedAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("notifications.manage");
  const parsed = notificationIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing notification id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const reason = String(formData.get("reason") ?? "manual");
  const [before] = await db
    .select()
    .from(notificationQueue)
    .where(eq(notificationQueue.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Notification not found." };

  await db
    .update(notificationQueue)
    .set({ status: "failed", failedAt: new Date(), errorMessage: reason })
    .where(eq(notificationQueue.id, parsed.data.id));

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "notifications.mark_failed",
    entityType: "notification_queue",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "failed", reason },
  });

  revalidatePath("/dashboard/notifications");
  return { ok: true };
}

export async function cancelNotificationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("notifications.write");
  const parsed = notificationIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing notification id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  await db
    .update(notificationQueue)
    .set({ status: "cancelled" })
    .where(eq(notificationQueue.id, parsed.data.id));

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "notifications.cancel",
    entityType: "notification_queue",
    entityId: parsed.data.id,
  });

  revalidatePath("/dashboard/notifications");
  return { ok: true };
}

export async function updateNotificationPreferenceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("notifications.manage");
  const parsed = updateNotificationPreferenceSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: "Please review the preference form." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const values: typeof notificationPreferences.$inferInsert = {
    appUserId: d.appUserId ?? null,
    ownerId: d.ownerId ?? null,
    roleKey: d.roleKey && d.roleKey !== "" ? d.roleKey : null,
    channel: d.channel,
    templateKey: d.templateKey,
    enabled: d.enabled,
    quietHoursStart:
      d.quietHoursStart && d.quietHoursStart !== "" ? d.quietHoursStart : null,
    quietHoursEnd: d.quietHoursEnd && d.quietHoursEnd !== "" ? d.quietHoursEnd : null,
  };

  if (d.id) {
    await db
      .update(notificationPreferences)
      .set(values)
      .where(eq(notificationPreferences.id, d.id));
  } else {
    await db.insert(notificationPreferences).values(values);
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "notifications.preference.upsert",
    entityType: "notification_preference",
    entityId: d.id ?? null,
    after: { channel: d.channel, templateKey: d.templateKey, enabled: d.enabled },
  });

  revalidatePath("/dashboard/notifications/preferences");
  return { ok: true };
}

// =============================================================================
// v8A — In-app inbox + retry + delivery + digest actions
// =============================================================================

const inboxIdSchema = z.object({ id: z.string().uuid() });

export async function markInAppNotificationReadAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("notifications.read");
  const parsed = inboxIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const [row] = await db
    .select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.id, parsed.data.id))
    .limit(1);
  if (!row) return { ok: false, error: "Inbox row not found." };
  if (row.appUserId !== me.id)
    return { ok: false, error: "Not your inbox row." };

  await db
    .update(inAppNotifications)
    .set({ status: "read", readAt: new Date() })
    .where(eq(inAppNotifications.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me.id,
    action: "notification.in_app.read",
    entityType: "in_app_notification",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/notifications/inbox");
  return { ok: true };
}

export async function archiveInAppNotificationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("notifications.read");
  const parsed = inboxIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const [row] = await db
    .select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.id, parsed.data.id))
    .limit(1);
  if (!row) return { ok: false, error: "Inbox row not found." };
  if (row.appUserId !== me.id)
    return { ok: false, error: "Not your inbox row." };

  await db
    .update(inAppNotifications)
    .set({ status: "archived", archivedAt: new Date() })
    .where(eq(inAppNotifications.id, parsed.data.id));
  revalidatePath("/dashboard/notifications/inbox");
  return { ok: true };
}

const queueIdSchema = z.object({ id: z.string().uuid() });

export async function retryNotificationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("notifications.manage");
  const parsed = queueIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing notification id." };
  const reset = await requeueNotification(parsed.data.id);
  if (!reset.ok) return { ok: false, error: reset.reason ?? "requeue failed" };
  const out = await deliverNotification(parsed.data.id);
  await recordAuditEvent({
    actorUserId: (await getCurrentAppUser())?.id ?? null,
    action: "notification.delivery.retry",
    entityType: "notification_queue",
    entityId: parsed.data.id,
    after: { finalStatus: out.finalStatus, sent: out.sent, failed: out.failed },
  });
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/notifications/deliveries");
  return { ok: true };
}

export async function deliverPendingNotificationsAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<
  ActionResult & {
    sent?: number;
    failed?: number;
    suppressed?: number;
    notificationsChecked?: number;
  }
> {
  await requirePermission("notifications.manage");
  const me = await getCurrentAppUser();
  const handle = await startJobRun(
    "deliver_pending_notifications",
    "manual",
    me?.id ?? null,
  );
  try {
    const metrics = await deliverPendingNotifications(100);
    await finishJobRun(handle, {
      status: metrics.failed > 0 && metrics.sent === 0 ? "failed" : "success",
      summary: `Manual delivery · sent ${metrics.sent} · failed ${metrics.failed}`,
      metrics: metrics as unknown as Record<string, unknown>,
    });
    revalidatePath("/dashboard/notifications");
    return {
      ok: true,
      sent: metrics.sent,
      failed: metrics.failed,
      suppressed: metrics.suppressed,
      notificationsChecked: metrics.notificationsChecked,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "delivery threw";
    await finishJobRun(handle, {
      status: "failed",
      summary: "manual delivery threw",
      error: message,
    });
    return { ok: false, error: message };
  }
}

export async function queueDigestNowAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requirePermission("notifications.manage");
  const me = await getCurrentAppUser();
  const handle = await startJobRun(
    "notification_digest_internal",
    "manual",
    me?.id ?? null,
  );
  try {
    const outcome = await runNotificationDigestJob(handle);
    await finishJobRun(handle, {
      status: outcome.status,
      summary: outcome.summary,
      metrics: outcome.metrics,
    });
    revalidatePath("/dashboard/notifications");
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "digest threw";
    await finishJobRun(handle, {
      status: "failed",
      summary: "manual digest threw",
      error: message,
    });
    return { ok: false, error: message };
  }
}

const upsertSelfPrefSchema = z.object({
  channel: z.enum(["in_app", "email", "sms", "whatsapp", "telegram"]),
  templateKey: z.string().min(2).max(80),
  enabled: z.coerce.boolean().optional().default(true),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
});

/**
 * Upsert a notification preference scoped to the current signed-in user.
 * Looks up an existing row by (app_user_id, channel, template_key) and
 * updates if present, otherwise inserts.
 */
export async function updateCurrentUserNotificationPreferenceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("notifications.read");
  const parsed = upsertSelfPrefSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the preference form." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const d = parsed.data;

  const existing = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.appUserId, me.id),
        eq(notificationPreferences.channel, d.channel),
        eq(notificationPreferences.templateKey, d.templateKey),
      ),
    )
    .limit(1);

  const values: typeof notificationPreferences.$inferInsert = {
    appUserId: me.id,
    channel: d.channel,
    templateKey: d.templateKey,
    enabled: d.enabled,
    quietHoursStart:
      d.quietHoursStart && d.quietHoursStart !== "" ? d.quietHoursStart : null,
    quietHoursEnd:
      d.quietHoursEnd && d.quietHoursEnd !== "" ? d.quietHoursEnd : null,
  };

  if (existing.length > 0) {
    await db
      .update(notificationPreferences)
      .set(values)
      .where(eq(notificationPreferences.id, existing[0].id));
  } else {
    await db.insert(notificationPreferences).values(values);
  }

  await recordAuditEvent({
    actorUserId: me.id,
    action: "notification.preference.update",
    entityType: "notification_preference",
    entityId: existing[0]?.id ?? null,
    after: {
      channel: d.channel,
      templateKey: d.templateKey,
      enabled: d.enabled,
    },
  });
  revalidatePath("/dashboard/notifications/preferences");
  return { ok: true };
}

// =============================================================================
// v8B — Owner portal inbox actions
// =============================================================================
//
// These mirror the internal mark-read / archive actions but scope visibility
// through `isInboxRowVisibleToCurrentOwner`, which validates that the row
// targets the signed-in app_user directly OR an owner they hold an active
// grant on. RLS already enforces this at the row level; the explicit check
// gives us a clean error message instead of a 403 when something slips.

export async function markOwnerInboxReadAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = inboxIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const visible = await isInboxRowVisibleToCurrentOwner(parsed.data.id);
  if (!visible) return { ok: false, error: "Inbox row not visible." };

  await db
    .update(inAppNotifications)
    .set({ status: "read", readAt: new Date() })
    .where(eq(inAppNotifications.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me.id,
    action: "owner.inbox.read",
    entityType: "in_app_notification",
    entityId: parsed.data.id,
  });
  revalidatePath("/owner/inbox");
  return { ok: true };
}

export async function archiveOwnerInboxAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = inboxIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const visible = await isInboxRowVisibleToCurrentOwner(parsed.data.id);
  if (!visible) return { ok: false, error: "Inbox row not visible." };

  await db
    .update(inAppNotifications)
    .set({ status: "archived", archivedAt: new Date() })
    .where(eq(inAppNotifications.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me.id,
    action: "owner.inbox.archive",
    entityType: "in_app_notification",
    entityId: parsed.data.id,
  });
  revalidatePath("/owner/inbox");
  return { ok: true };
}
