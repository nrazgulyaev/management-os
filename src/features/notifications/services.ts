import "server-only";

import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  inAppNotifications,
  notificationDeliveries,
  notificationPreferences,
  notificationQueue,
} from "@/lib/db/schema/notifications";
import { appUsers } from "@/lib/db/schema/identity";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { demoOwnerIdFallback } from "@/features/demo-data/owner-fallback";
import {
  isDemoOwnerFallbackActive,
  listDemoOwnerInboxNotifications,
} from "@/features/demo-data/owner-portal-fallback";
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

// -----------------------------------------------------------------------------
// v8A — In-app inbox helpers
// -----------------------------------------------------------------------------

export interface InAppNotificationRow {
  id: string;
  notificationId: string | null;
  appUserId: string | null;
  ownerId: string | null;
  roleKey: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  priority: string;
  status: string;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

function mapInbox(r: typeof inAppNotifications.$inferSelect): InAppNotificationRow {
  return {
    id: r.id,
    notificationId: r.notificationId,
    appUserId: r.appUserId,
    ownerId: r.ownerId,
    roleKey: r.roleKey,
    title: r.title,
    body: r.body,
    payload: r.payload as Record<string, unknown> | null,
    priority: r.priority,
    status: r.status,
    readAt: r.readAt?.toISOString() ?? null,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Inbox for the currently signed-in app_user. Returns rows in
 * unread → read → archived order, newest first within each bucket.
 */
export async function listInAppNotificationsForCurrentUser(opts?: {
  status?: "unread" | "read" | "archived";
  limit?: number;
}): Promise<InAppNotificationRow[]> {
  const db = getDb();
  if (!db) return [];
  const me = await getCurrentAppUser();
  if (!me) return [];

  const filters = [eq(inAppNotifications.appUserId, me.id)];
  if (opts?.status) filters.push(eq(inAppNotifications.status, opts.status));

  const rows = await db
    .select()
    .from(inAppNotifications)
    .where(and(...filters))
    .orderBy(asc(inAppNotifications.status), desc(inAppNotifications.createdAt))
    .limit(opts?.limit ?? 100);
  return rows.map(mapInbox);
}

export async function countUnreadForCurrentUser(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const me = await getCurrentAppUser();
  if (!me) return 0;
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(inAppNotifications)
    .where(
      and(
        eq(inAppNotifications.appUserId, me.id),
        eq(inAppNotifications.status, "unread"),
      ),
    );
  const operationalUnread = Number(row?.c ?? 0);

  // DAILY-DIGEST-SPRINT-1 P4.1 — additive UNION over the new
  // `notifications` table (created in migration 0111). Two parallel
  // notification systems live for now (see src/features/digests/
  // queries.ts for the rationale); this read combines their unread
  // counts so the topbar bell badge reflects the user's TRUE
  // unread total. Read-only; no writer-side changes.
  const { countUnreadDigestsForCurrentUser } = await import(
    "@/features/digests/queries"
  );
  const digestUnread = await countUnreadDigestsForCurrentUser();

  return operationalUnread + digestUnread;
}

// -----------------------------------------------------------------------------
// v8A — Delivery log + queue with attempt metadata
// -----------------------------------------------------------------------------

export interface DeliveryRow {
  id: string;
  notificationId: string;
  channel: string;
  provider: string;
  recipientAddress: string | null;
  status: string;
  providerMessageId: string | null;
  attemptedAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export async function listNotificationDeliveries(opts?: {
  status?: string;
  channel?: string;
  provider?: string;
  notificationId?: string;
  limit?: number;
}): Promise<WithSource<DeliveryRow>[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.status) filters.push(eq(notificationDeliveries.status, opts.status));
  if (opts?.channel) filters.push(eq(notificationDeliveries.channel, opts.channel));
  if (opts?.provider) filters.push(eq(notificationDeliveries.provider, opts.provider));
  if (opts?.notificationId)
    filters.push(eq(notificationDeliveries.notificationId, opts.notificationId));

  const rows = await db
    .select()
    .from(notificationDeliveries)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(notificationDeliveries.createdAt))
    .limit(opts?.limit ?? 200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.id,
    notificationId: r.notificationId,
    channel: r.channel,
    provider: r.provider,
    recipientAddress: r.recipientAddress,
    status: r.status,
    providerMessageId: r.providerMessageId,
    attemptedAt: r.attemptedAt?.toISOString() ?? null,
    sentAt: r.sentAt?.toISOString() ?? null,
    failedAt: r.failedAt?.toISOString() ?? null,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Extended queue row that includes the v8A retry metadata. */
export interface NotificationRowWithAttempts extends NotificationRow {
  deliveryAttempts: number;
  lastAttemptedAt: string | null;
  nextAttemptAt: string | null;
}

export async function listNotificationsWithAttempts(opts?: {
  status?: string;
  limit?: number;
}): Promise<WithSource<NotificationRowWithAttempts>[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.status) filters.push(eq(notificationQueue.status, opts.status));
  const rows = await db
    .select()
    .from(notificationQueue)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(notificationQueue.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    source: "db" as const,
    ...mapNotification(r),
    deliveryAttempts: r.deliveryAttempts,
    lastAttemptedAt: r.lastAttemptedAt?.toISOString() ?? null,
    nextAttemptAt: r.nextAttemptAt?.toISOString() ?? null,
  }));
}

// -----------------------------------------------------------------------------
// v8B — Owner portal inbox helpers
// -----------------------------------------------------------------------------

/**
 * Resolve every owner_id the current app_user has been granted access to.
 * Empty list when not signed in / no grants. Used by the owner portal
 * inbox to scope `in_app_notifications` rows.
 *
 * P116A — In demo mode (NEXT_PUBLIC_ENABLE_DEMO_MODE=1 or
 * ARCONIQUE_FORCE_MOCK=1), if the resolved list is empty, fall back to
 * the seeded demo owner so the owner portal renders meaningful demo
 * content out of the box. The fallback never fires in production.
 */
export async function listOwnerIdsForCurrentUser(): Promise<string[]> {
  const db = getDb();
  if (!db) return demoOwnerIdFallback();
  const me = await getCurrentAppUser();
  if (!me) return demoOwnerIdFallback();
  const rows = await db
    .select({ ownerId: appUsersOwners.ownerId })
    .from(appUsersOwners)
    .where(
      and(
        eq(appUsersOwners.appUserId, me.id),
        eq(appUsersOwners.status, "active"),
      ),
    );
  if (rows.length === 0) return demoOwnerIdFallback();
  return rows.map((r) => r.ownerId);
}

/**
 * Owner-portal inbox listing — visibility includes:
 *   • rows addressed to this app_user directly (appUserId match), and
 *   • rows addressed to any owner this user has an active grant on.
 * Sort order matches the internal inbox (unread → read → archived,
 * newest first within each bucket).
 */
export async function listInAppNotificationsForCurrentOwner(opts?: {
  status?: "unread" | "read" | "archived";
  limit?: number;
}): Promise<InAppNotificationRow[]> {
  const db = getDb();
  if (!db) return demoOwnerInboxFallback(opts?.status);
  const me = await getCurrentAppUser();
  const ownerIds = me ? await listOwnerIdsForCurrentUser() : demoOwnerIdFallback();

  // P116B — when there is no auth user but demo mode is active, scope
  // by owner id alone so the demo owner's inbox is visible.
  const visibility = me
    ? ownerIds.length > 0
      ? or(
          eq(inAppNotifications.appUserId, me.id),
          inArray(inAppNotifications.ownerId, ownerIds),
        )
      : eq(inAppNotifications.appUserId, me.id)
    : ownerIds.length > 0
      ? inArray(inAppNotifications.ownerId, ownerIds)
      : null;

  if (!visibility) return demoOwnerInboxFallback(opts?.status);

  const filters = [visibility];
  if (opts?.status) filters.push(eq(inAppNotifications.status, opts.status));

  const rows = await db
    .select()
    .from(inAppNotifications)
    .where(and(...filters))
    .orderBy(asc(inAppNotifications.status), desc(inAppNotifications.createdAt))
    .limit(opts?.limit ?? 100);
  if (rows.length === 0) return demoOwnerInboxFallback(opts?.status);
  return rows.map(mapInbox);
}

function demoOwnerInboxFallback(
  status?: "unread" | "read" | "archived",
): InAppNotificationRow[] {
  if (!isDemoOwnerFallbackActive()) return [];
  const all = listDemoOwnerInboxNotifications();
  const filtered = status ? all.filter((n) => n.status === status) : all;
  return filtered.map((n) => ({
    id: n.id,
    notificationId: null,
    appUserId: null,
    ownerId: n.ownerId,
    roleKey: null,
    title: n.title,
    body: n.body,
    payload: n.href ? { href: n.href } : null,
    priority: "normal",
    status: n.status,
    readAt: null,
    archivedAt: null,
    createdAt: n.createdAt,
  }));
}

export async function countUnreadInboxForCurrentOwner(): Promise<number> {
  const db = getDb();
  if (!db) return demoOwnerInboxFallback("unread").length;
  const me = await getCurrentAppUser();
  const ownerIds = me ? await listOwnerIdsForCurrentUser() : demoOwnerIdFallback();

  const visibility = me
    ? ownerIds.length > 0
      ? or(
          eq(inAppNotifications.appUserId, me.id),
          inArray(inAppNotifications.ownerId, ownerIds),
        )
      : eq(inAppNotifications.appUserId, me.id)
    : ownerIds.length > 0
      ? inArray(inAppNotifications.ownerId, ownerIds)
      : null;
  if (!visibility) return demoOwnerInboxFallback("unread").length;

  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(inAppNotifications)
    .where(and(visibility, eq(inAppNotifications.status, "unread")));
  const count = Number(row?.c ?? 0);
  return count > 0 ? count : demoOwnerInboxFallback("unread").length;
}

/**
 * True when the current app_user is allowed to act on a given inbox
 * row — either it targets them directly, or it targets an owner they
 * hold a grant on. Pure DB check; UI calls this before performing
 * mutations so we can return a clean error rather than 403.
 */
export async function isInboxRowVisibleToCurrentOwner(
  inboxId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const me = await getCurrentAppUser();
  if (!me) return false;
  const [row] = await db
    .select({
      appUserId: inAppNotifications.appUserId,
      ownerId: inAppNotifications.ownerId,
    })
    .from(inAppNotifications)
    .where(eq(inAppNotifications.id, inboxId))
    .limit(1);
  if (!row) return false;
  if (row.appUserId === me.id) return true;
  if (!row.ownerId) return false;
  const ownerIds = await listOwnerIdsForCurrentUser();
  return ownerIds.includes(row.ownerId);
}
