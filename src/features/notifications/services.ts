import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  notificationPreferences,
  notificationQueue,
} from "@/lib/db/schema/notifications";
import { appUsers } from "@/lib/db/schema/identity";
import type { WithSource } from "@/features/types";
import type { QueueNotificationInput } from "./schema";

export interface NotificationRow {
  id: string;
  recipientType: string;
  recipientId: string | null;
  channel: string;
  templateKey: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  dedupeKey: string | null;
  createdAt: string;
}

export interface NotificationPreferenceRow {
  id: string;
  appUserId: string | null;
  appUserName: string | null;
  ownerId: string | null;
  roleKey: string | null;
  channel: string;
  templateKey: string;
  enabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export interface QueueResult {
  status: "queued" | "suppressed";
  notificationId: string;
}

/**
 * Insert a notification row. If `dedupe_key` is set and an open
 * (queued/sent) row already exists with the same key, the call is a
 * no-op — we return the existing row id with status "suppressed".
 *
 * Pure DB plumbing — no permission gate. Higher-level callers (jobs,
 * server actions) gate themselves.
 */
export async function queueNotification(
  input: QueueNotificationInput,
): Promise<QueueResult | null> {
  const db = getDb();
  if (!db) return null;

  if (input.dedupeKey) {
    const [existing] = await db
      .select()
      .from(notificationQueue)
      .where(
        and(
          eq(notificationQueue.dedupeKey, input.dedupeKey),
          // open = queued or sent — anything still alive that would be a duplicate
          eq(notificationQueue.status, "queued"),
        ),
      )
      .limit(1);
    if (existing) {
      return { status: "suppressed", notificationId: existing.id };
    }
  }

  const [row] = await db
    .insert(notificationQueue)
    .values({
      recipientType: input.recipientType,
      recipientId: input.recipientId ?? null,
      channel: input.channel,
      templateKey: input.templateKey,
      title: input.title,
      body: input.body,
      payload: (input.payload ?? null) as typeof notificationQueue.$inferInsert["payload"],
      priority: input.priority,
      status: "queued",
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      dedupeKey: input.dedupeKey ?? null,
    })
    .returning({ id: notificationQueue.id });

  return { status: "queued", notificationId: row.id };
}

export async function suppressDuplicateNotification(
  dedupeKey: string,
): Promise<NotificationRow | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(notificationQueue)
    .where(eq(notificationQueue.dedupeKey, dedupeKey))
    .orderBy(desc(notificationQueue.createdAt))
    .limit(1);
  return row ? mapNotification(row) : null;
}

export async function listNotifications(opts?: {
  status?: string;
  channel?: string;
  templateKey?: string;
  limit?: number;
}): Promise<WithSource<NotificationRow>[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.status) filters.push(eq(notificationQueue.status, opts.status));
  if (opts?.channel) filters.push(eq(notificationQueue.channel, opts.channel));
  if (opts?.templateKey) filters.push(eq(notificationQueue.templateKey, opts.templateKey));

  const rows = await db
    .select()
    .from(notificationQueue)
    .where(filters.length ? filters.reduce((a, b) => a && b) : undefined)
    .orderBy(desc(notificationQueue.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({ source: "db" as const, ...mapNotification(r) }));
}

export async function getNotificationById(id: string): Promise<NotificationRow | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(notificationQueue)
    .where(eq(notificationQueue.id, id))
    .limit(1);
  return r ? mapNotification(r) : null;
}

export async function listNotificationPreferences(): Promise<
  WithSource<NotificationPreferenceRow>[]
> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      p: notificationPreferences,
      appUserName: appUsers.fullName,
    })
    .from(notificationPreferences)
    .leftJoin(appUsers, eq(appUsers.id, notificationPreferences.appUserId))
    .orderBy(asc(notificationPreferences.templateKey));

  return rows.map((r) => ({
    source: "db" as const,
    id: r.p.id,
    appUserId: r.p.appUserId,
    appUserName: r.appUserName ?? null,
    ownerId: r.p.ownerId,
    roleKey: r.p.roleKey,
    channel: r.p.channel,
    templateKey: r.p.templateKey,
    enabled: r.p.enabled,
    quietHoursStart: r.p.quietHoursStart,
    quietHoursEnd: r.p.quietHoursEnd,
  }));
}

function mapNotification(r: typeof notificationQueue.$inferSelect): NotificationRow {
  return {
    id: r.id,
    recipientType: r.recipientType,
    recipientId: r.recipientId,
    channel: r.channel,
    templateKey: r.templateKey,
    title: r.title,
    body: r.body,
    priority: r.priority,
    status: r.status,
    scheduledFor: r.scheduledFor?.toISOString() ?? null,
    sentAt: r.sentAt?.toISOString() ?? null,
    failedAt: r.failedAt?.toISOString() ?? null,
    errorMessage: r.errorMessage,
    dedupeKey: r.dedupeKey,
    createdAt: r.createdAt.toISOString(),
  };
}
