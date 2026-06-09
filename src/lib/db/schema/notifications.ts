import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { owners } from "./ownership";
import { organizations } from "./saas";

/**
 * Notifications domain.
 *   v7 — `notification_queue` + `notification_preferences` (foundation).
 *   v8A — `notification_deliveries` (provider attempts) +
 *          `in_app_notifications` (durable per-user inbox) +
 *          retry/attempt columns on the queue.
 *
 * The queue stays the source of truth: every `queueNotification` call
 * inserts one queue row. The delivery worker creates one
 * `notification_deliveries` row per channel attempt and (for in_app)
 * also materialises `in_app_notifications` per recipient.
 */

export const notificationQueue = pgTable(
  "notification_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled to ARCONIQUE_DEFAULT (recipient is polymorphic; no
    // reliable parent FK). Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    /** internal_user | owner | guest | role — when "role" the recipient_id is null. */
    recipientType: text("recipient_type").notNull(),
    recipientId: uuid("recipient_id"),
    channel: text("channel").notNull(),
    templateKey: text("template_key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload"),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("queued"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    /** dedupe_key collapses repeated alerts. The DB has a partial unique index
     *  active only while status IN ('queued','sent') — see migration 0008. */
    dedupeKey: text("dedupe_key"),
    /** v8A — retry / attempt tracking */
    deliveryAttempts: integer("delivery_attempts").notNull().default(0),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    /** v8B — cap retries before giving up. */
    maxAttempts: integer("max_attempts").notNull().default(3),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("nq_status_idx").on(t.status),
    index("nq_template_idx").on(t.templateKey),
    index("nq_channel_idx").on(t.channel),
    index("nq_recipient_idx").on(t.recipientType, t.recipientId),
    index("nq_next_attempt_idx").on(t.status, t.nextAttemptAt),
    index("nq_org_idx").on(t.organizationId),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via notification_queue.organization_id. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notificationQueue.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    provider: text("provider").notNull().default("in_app"),
    recipientAddress: text("recipient_address"),
    status: text("status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    responseJson: jsonb("response_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("nd_notification_idx").on(t.notificationId),
    index("nd_channel_idx").on(t.channel),
    index("nd_status_idx").on(t.status),
    index("nd_attempted_idx").on(t.attemptedAt),
    index("nd_org_idx").on(t.organizationId),
  ],
);

export const inAppNotifications = pgTable(
  "in_app_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via notification_queue.organization_id; rows without a
    // queue link fall back to ARCONIQUE_DEFAULT. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    notificationId: uuid("notification_id").references(() => notificationQueue.id, {
      onDelete: "set null",
    }),
    appUserId: uuid("app_user_id").references(() => appUsers.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "cascade" }),
    roleKey: text("role_key"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload"),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("unread"),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ian_app_user_idx").on(t.appUserId),
    index("ian_owner_idx").on(t.ownerId),
    index("ian_role_idx").on(t.roleKey),
    index("ian_status_idx").on(t.status),
    index("ian_created_idx").on(t.createdAt),
    index("ian_org_idx").on(t.organizationId),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled to ARCONIQUE_DEFAULT (preferences are per-user, not
    // per-org today). Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    appUserId: uuid("app_user_id").references(() => appUsers.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "cascade" }),
    roleKey: text("role_key"),
    channel: text("channel").notNull(),
    templateKey: text("template_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** "HH:MM" 24h. NULL = no quiet hours configured. */
    quietHoursStart: text("quiet_hours_start"),
    quietHoursEnd: text("quiet_hours_end"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("np_app_user_idx").on(t.appUserId),
    index("np_owner_idx").on(t.ownerId),
    index("np_role_idx").on(t.roleKey),
    index("np_template_idx").on(t.templateKey),
    index("np_org_idx").on(t.organizationId),
  ],
);

export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled to ARCONIQUE_DEFAULT (templates are org-global today).
    // Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    templateKey: text("template_key").notNull(),
    channel: text("channel").notNull(),
    subjectTemplate: text("subject_template"),
    bodyTemplate: text("body_template").notNull(),
    htmlTemplate: text("html_template"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_templates_key_idx").on(t.templateKey),
    index("notification_templates_channel_idx").on(t.channel),
    index("notification_templates_org_idx").on(t.organizationId),
  ],
);

export type NotificationQueueRow = typeof notificationQueue.$inferSelect;
export type NewNotificationQueueRow = typeof notificationQueue.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
export type InAppNotification = typeof inAppNotifications.$inferSelect;
export type NewInAppNotification = typeof inAppNotifications.$inferInsert;
export type NotificationTemplate = typeof notificationTemplates.$inferSelect;
export type NewNotificationTemplate = typeof notificationTemplates.$inferInsert;
