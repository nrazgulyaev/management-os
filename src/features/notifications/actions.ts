"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
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
