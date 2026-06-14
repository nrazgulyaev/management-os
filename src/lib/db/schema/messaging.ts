/**
 * Stage 6.P2.A — Unified messaging schema.
 *
 * 4 tables (migration 0078):
 *   - conversation_threads     unified threads across messaging channels
 *   - conversation_messages    individual messages with channel + direction
 *   - message_templates        reusable per-channel templates
 *   - auto_response_rules      keyword/first_message/after_hours triggers
 *
 * RLS: per-org isolation via is_in_user_organization() (Stage 5.J helper).
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";
import { contacts } from "./contacts";

// ---------------------------------------------------------------------------
// conversation_threads
// ---------------------------------------------------------------------------
export const conversationThreads = pgTable(
  "conversation_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),

    /** MessagingChannel[] — which channels have been used in this thread. */
    channelsUsed: text("channels_used").array().notNull().default(sql`'{}'`),
    primaryChannel: text("primary_channel"),

    /** { "whatsapp": "+62...", "telegram": "12345", ... } */
    externalIdentifiers: jsonb("external_identifiers")
      .notNull()
      .default(sql`'{}'::jsonb`),

    /** ThreadStatus FSM */
    status: text("status").notNull().default("active"),

    assignedToUserId: uuid("assigned_to_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),

    totalMessages: integer("total_messages").notNull().default(0),
    unreadCount: integer("unread_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),

    subject: text("subject"),
    tags: text("tags").array(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("conversation_threads_org_idx").on(t.organizationId),
    index("conversation_threads_status_idx").on(t.status),
    index("conversation_threads_last_message_idx").on(
      sql`${t.lastMessageAt} DESC`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// conversation_messages
// ---------------------------------------------------------------------------
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => conversationThreads.id, { onDelete: "cascade" }),

    /** MessagingChannel */
    channel: text("channel").notNull(),
    /** Platform's message ID — idempotency key. */
    externalMessageId: text("external_message_id"),
    externalThreadId: text("external_thread_id"),

    /** 'inbound' | 'outbound' */
    direction: text("direction").notNull(),

    senderExternalId: text("sender_external_id"),
    senderDisplayName: text("sender_display_name"),
    senderUserId: uuid("sender_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),

    recipientExternalId: text("recipient_external_id"),

    /** ContentType FSM — see CHECK in migration */
    contentType: text("content_type").notNull().default("text"),
    contentText: text("content_text"),
    contentMediaUrl: text("content_media_url"),
    contentMediaThumbnailUrl: text("content_media_thumbnail_url"),
    contentMetadata: jsonb("content_metadata"),

    replyToExternalId: text("reply_to_external_id"),
    replyToMessageId: uuid("reply_to_message_id"),

    /** MessageStatus FSM */
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),

    /** Per-channel cost. Telegram free; WhatsApp Business charges per
     *  conversation; Resend / Gmail vary. */
    costMinor: bigint("cost_minor", { mode: "bigint" }),
    costCurrency: text("cost_currency"),

    rawPayload: jsonb("raw_payload"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("conversation_messages_thread_idx").on(t.threadId),
    index("conversation_messages_direction_idx").on(t.direction),
    index("conversation_messages_status_idx").on(t.status),
    // PERF: org-scoped message reads had no org index (this is the highest-
    // volume messaging table).
    index("conversation_messages_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// message_templates
// ---------------------------------------------------------------------------
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),

    supportedChannels: text("supported_channels").array().notNull(),

    /** { "whatsapp": "Hi {{guest_name}}", "email": "<html>..." } */
    contentPerChannel: jsonb("content_per_channel")
      .notNull()
      .default(sql`'{}'::jsonb`),

    whatsappTemplateName: text("whatsapp_template_name"),
    whatsappTemplateStatus: text("whatsapp_template_status"),

    variables: text("variables").array().notNull().default(sql`'{}'`),

    /** TemplateStatus FSM */
    status: text("status").notNull().default("draft"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("message_templates_org_idx").on(t.organizationId),
    index("message_templates_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// auto_response_rules
// ---------------------------------------------------------------------------
export const autoResponseRules = pgTable(
  "auto_response_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    description: text("description"),

    channels: text("channels").array().notNull(),
    /** TriggerType */
    triggerType: text("trigger_type").notNull(),
    triggerConfig: jsonb("trigger_config").notNull(),

    /** ActionType */
    actionType: text("action_type").notNull(),
    actionConfig: jsonb("action_config").notNull(),

    throttleWindowMinutes: integer("throttle_window_minutes")
      .notNull()
      .default(60),
    priority: integer("priority").notNull().default(100),

    isActive: boolean("is_active").notNull().default(true),

    triggerCount: integer("trigger_count").notNull().default(0),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("auto_response_rules_org_idx").on(t.organizationId),
    index("auto_response_rules_active_idx").on(t.isActive, t.priority),
  ],
);

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------
export type ConversationThread = typeof conversationThreads.$inferSelect;
export type NewConversationThread = typeof conversationThreads.$inferInsert;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;
export type AutoResponseRule = typeof autoResponseRules.$inferSelect;
export type NewAutoResponseRule = typeof autoResponseRules.$inferInsert;

// ---------------------------------------------------------------------------
// String-union types — mirror SQL CHECK constraints. Updates require
// editing both files.
// ---------------------------------------------------------------------------

export type MessagingChannel =
  | "whatsapp"
  | "telegram"
  | "instagram"
  | "facebook_messenger"
  | "email"
  | "sms"
  | "internal_note";

export const MESSAGING_CHANNELS: readonly MessagingChannel[] = [
  "whatsapp",
  "telegram",
  "instagram",
  "facebook_messenger",
  "email",
  "sms",
  "internal_note",
] as const;

export type ThreadStatus =
  | "active"
  | "archived"
  | "spam"
  | "pending_assignment";

export const THREAD_STATUSES: readonly ThreadStatus[] = [
  "active",
  "archived",
  "spam",
  "pending_assignment",
] as const;

export type MessageDirection = "inbound" | "outbound";

export type MessageContentType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "location"
  | "contact"
  | "sticker"
  | "template_message"
  | "reaction"
  | "reply"
  | "system";

export const MESSAGE_CONTENT_TYPES: readonly MessageContentType[] = [
  "text",
  "image",
  "document",
  "audio",
  "video",
  "location",
  "contact",
  "sticker",
  "template_message",
  "reaction",
  "reply",
  "system",
] as const;

export type MessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "received";

export const MESSAGE_STATUSES: readonly MessageStatus[] = [
  "pending",
  "sent",
  "delivered",
  "read",
  "failed",
  "received",
] as const;

export type TemplateStatus = "draft" | "active" | "archived";

export type WhatsappTemplateStatus = "pending" | "approved" | "rejected";

export type AutoResponseTriggerType =
  | "keyword"
  | "first_message"
  | "after_hours"
  | "no_response_timeout";

export const AUTO_RESPONSE_TRIGGER_TYPES: readonly AutoResponseTriggerType[] = [
  "keyword",
  "first_message",
  "after_hours",
  "no_response_timeout",
] as const;

export type AutoResponseActionType =
  | "send_template"
  | "send_text"
  | "assign_to_user"
  | "add_tag";

export const AUTO_RESPONSE_ACTION_TYPES: readonly AutoResponseActionType[] = [
  "send_template",
  "send_text",
  "assign_to_user",
  "add_tag",
] as const;
