/**
 * Stage 5.I — PWA + offline + push schemas.
 *
 * 3 tables:
 *   - push_subscriptions          per-user / per-device push endpoints
 *   - notification_dispatch_log   one row per dispatched push notification
 *   - offline_action_queue        server-side audit log of synced offline actions
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dhKey: text("p256dh_key").notNull(),
    authKey: text("auth_key").notNull(),
    deviceLabel: text("device_label"),
    userAgent: text("user_agent"),
    deviceType: text("device_type"),
    isActive: boolean("is_active").notNull().default(true),
    enabledNotificationTypes: text("enabled_notification_types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastSuccessfulDeliveryAt: timestamp("last_successful_delivery_at", {
      withTimezone: true,
    }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    lastFailureReason: text("last_failure_reason"),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

export const notificationDispatchLog = pgTable(
  "notification_dispatch_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dispatchCode: text("dispatch_code").notNull().unique(),
    notificationType: text("notification_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    dataPayload: jsonb("data_payload"),
    targetUserId: uuid("target_user_id").references(() => appUsers.id),
    targetSubscriptionId: uuid("target_subscription_id").references(
      () => pushSubscriptions.id,
    ),
    targetRole: text("target_role"),
    sourceType: text("source_type").notNull(),
    sourceEntityId: uuid("source_entity_id"),
    dispatchStatus: text("dispatch_status").notNull().default("pending"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notification_dispatch_log_user_idx").on(t.targetUserId),
    index("notification_dispatch_log_status_idx").on(t.dispatchStatus),
    index("notification_dispatch_log_source_idx").on(
      t.sourceType,
      t.sourceEntityId,
    ),
  ],
);

export const offlineActionQueue = pgTable(
  "offline_action_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actionCode: text("action_code").notNull().unique(),
    clientActionId: text("client_action_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id),
    deviceSubscriptionId: uuid("device_subscription_id").references(
      () => pushSubscriptions.id,
    ),
    actionType: text("action_type").notNull(),
    actionPayload: jsonb("action_payload").notNull(),
    clientInitiatedAt: timestamp("client_initiated_at", {
      withTimezone: true,
    }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    syncStatus: text("sync_status").notNull().default("received"),
    createdEntityType: text("created_entity_type"),
    createdEntityId: uuid("created_entity_id"),
    errorMessage: text("error_message"),
    conflictDetected: boolean("conflict_detected").notNull().default(false),
    conflictResolution: text("conflict_resolution"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("offline_action_queue_user_idx").on(t.userId),
    index("offline_action_queue_status_idx").on(t.syncStatus),
    index("offline_action_queue_synced_idx").on(t.syncedAt),
    index("offline_action_queue_type_idx").on(t.actionType),
    uniqueIndex("offline_action_queue_user_client_unique").on(
      t.userId,
      t.clientActionId,
    ),
  ],
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type NotificationDispatch = typeof notificationDispatchLog.$inferSelect;
export type NewNotificationDispatch = typeof notificationDispatchLog.$inferInsert;
export type OfflineQueueEntry = typeof offlineActionQueue.$inferSelect;
export type NewOfflineQueueEntry = typeof offlineActionQueue.$inferInsert;
