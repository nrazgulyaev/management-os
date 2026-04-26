import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { owners } from "./ownership";

/**
 * Durable notification queue. v7 scope: schema + admin UI only — no
 * external delivery providers (WhatsApp / SMS / email). The intent is so
 * downstream code can `queueNotification(...)` today and providers
 * deliver in v8+.
 */

export const notificationQueue = pgTable(
  "notification_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("nq_status_idx").on(t.status),
    index("nq_template_idx").on(t.templateKey),
    index("nq_channel_idx").on(t.channel),
    index("nq_recipient_idx").on(t.recipientType, t.recipientId),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
  ],
);

export type NotificationQueueRow = typeof notificationQueue.$inferSelect;
export type NewNotificationQueueRow = typeof notificationQueue.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
