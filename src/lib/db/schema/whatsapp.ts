/**
 * Stage 3.D — WhatsApp integration tables.
 *
 * Four append-only / mutable tables that back the inbound webhook,
 * outbound dispatcher, template management, and audit log. All RLS
 * internal-only. Cost lineage via `ai_assistant_runs.id` for inbound
 * intent classification.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  numeric,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { aiAssistantRuns } from "./ai";
import { siteReports } from "./site-operations";
import { projects } from "./projects";
import { devNotificationDeliveryLog } from "./sales";

export const whatsappPhoneNumbers = pgTable(
  "whatsapp_phone_numbers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull().unique(),
    displayName: text("display_name"),

    /**
     * 'arconique_outbound' | 'arconique_inbound' | 'recipient' | 'unknown'
     */
    numberType: text("number_type").notNull(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),

    resolvedEntityType: text("resolved_entity_type"),
    resolvedEntityId: uuid("resolved_entity_id"),

    provider: text("provider").notNull().default("twilio"),
    twilioPhoneSid: text("twilio_phone_sid"),

    isActive: boolean("is_active").notNull().default(true),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    totalMessagesSent: integer("total_messages_sent").notNull().default(0),
    totalMessagesReceived: integer("total_messages_received")
      .notNull()
      .default(0),

    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("whatsapp_phone_numbers_active_idx").on(t.isActive),
    index("whatsapp_phone_numbers_type_idx").on(t.numberType),
    index("whatsapp_phone_numbers_entity_idx").on(
      t.resolvedEntityType,
      t.resolvedEntityId,
    ),
    index("whatsapp_phone_numbers_project_idx").on(t.projectId),
  ],
);

export type WhatsappPhoneNumber = typeof whatsappPhoneNumbers.$inferSelect;
export type NewWhatsappPhoneNumber = typeof whatsappPhoneNumbers.$inferInsert;

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    provider: text("provider").notNull(),
    externalMessageSid: text("external_message_sid"),

    /** 'inbound' | 'outbound' */
    direction: text("direction").notNull(),
    fromPhone: text("from_phone").notNull(),
    toPhone: text("to_phone").notNull(),

    fromPhoneId: uuid("from_phone_id").references(
      () => whatsappPhoneNumbers.id,
      { onDelete: "set null" },
    ),
    toPhoneId: uuid("to_phone_id").references(
      () => whatsappPhoneNumbers.id,
      { onDelete: "set null" },
    ),

    /**
     * 'text' | 'voice' | 'image' | 'document' | 'video' | 'location' | 'template'
     */
    messageType: text("message_type").notNull(),
    body: text("body"),
    mediaUrls: text("media_urls").array(),
    templateName: text("template_name"),
    templateVariables: jsonb("template_variables"),

    voiceTranscript: text("voice_transcript"),
    voiceTranscriptLanguage: text("voice_transcript_language"),
    voiceTranscribedAt: timestamp("voice_transcribed_at", {
      withTimezone: true,
    }),

    /**
     * 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'processed'
     */
    status: text("status").notNull().default("received"),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    failureReason: text("failure_reason"),

    aiProcessedAt: timestamp("ai_processed_at", { withTimezone: true }),
    aiIntent: text("ai_intent"),
    aiIntentConfidence: numeric("ai_intent_confidence", {
      precision: 3,
      scale: 2,
    }),
    aiRunId: uuid("ai_run_id").references(() => aiAssistantRuns.id, {
      onDelete: "set null",
    }),

    createdSiteReportId: uuid("created_site_report_id").references(
      () => siteReports.id,
      { onDelete: "set null" },
    ),
    createdInvestorQaId: uuid("created_investor_qa_id"),

    deliveryLogId: uuid("delivery_log_id").references(
      () => devNotificationDeliveryLog.id,
      { onDelete: "set null" },
    ),

    webhookReceivedAt: timestamp("webhook_received_at", {
      withTimezone: true,
    }),
    webhookSignatureVerified: boolean("webhook_signature_verified"),
    webhookRawPayload: jsonb("webhook_raw_payload"),

    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("whatsapp_messages_provider_sid_unique")
      .on(t.provider, t.externalMessageSid)
      .where(sql`external_message_sid IS NOT NULL`),
    index("whatsapp_messages_external_sid_idx").on(t.externalMessageSid),
    index("whatsapp_messages_direction_idx").on(t.direction),
    index("whatsapp_messages_status_idx").on(t.status),
    index("whatsapp_messages_intent_idx").on(t.aiIntent),
    index("whatsapp_messages_from_phone_idx").on(t.fromPhoneId),
    index("whatsapp_messages_to_phone_idx").on(t.toPhoneId),
    index("whatsapp_messages_occurred_idx").on(sql`${t.occurredAt} desc`),
  ],
);

export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsappMessage = typeof whatsappMessages.$inferInsert;

export const whatsappMessageTemplates = pgTable(
  "whatsapp_message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateKey: text("template_key").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),

    /** {"en": {body: "...", header: "..."}, "ru": {...}, "id": {...}} */
    languageVersions: jsonb("language_versions")
      .notNull()
      .default(sql`'{}'::jsonb`),
    expectedVariables: text("expected_variables").array(),

    twilioTemplateSid: text("twilio_template_sid"),
    metaTemplateId: text("meta_template_id"),

    /**
     * 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'inactive'
     */
    approvalStatus: text("approval_status").notNull().default("draft"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),

    notificationEventType: text("notification_event_type"),

    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("whatsapp_message_templates_key_idx").on(t.templateKey),
    index("whatsapp_message_templates_status_idx").on(t.approvalStatus),
    index("whatsapp_message_templates_event_idx").on(
      t.notificationEventType,
    ),
  ],
);

export type WhatsappMessageTemplate =
  typeof whatsappMessageTemplates.$inferSelect;
export type NewWhatsappMessageTemplate =
  typeof whatsappMessageTemplates.$inferInsert;

export const whatsappWebhookEvents = pgTable(
  "whatsapp_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),

    signatureProvided: text("signature_provided"),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    sourceIp: text("source_ip"),

    rawPayload: jsonb("raw_payload").notNull(),

    processedAt: timestamp("processed_at", { withTimezone: true }),
    /**
     * 'pending' | 'processed' | 'failed' |
     * 'rejected_invalid_signature' | 'rejected_replay'
     */
    processingStatus: text("processing_status").notNull().default("pending"),
    processingError: text("processing_error"),
    relatedMessageId: uuid("related_message_id").references(
      () => whatsappMessages.id,
      { onDelete: "set null" },
    ),

    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("whatsapp_webhook_events_received_idx").on(
      sql`${t.receivedAt} desc`,
    ),
    index("whatsapp_webhook_events_status_idx").on(t.processingStatus),
    index("whatsapp_webhook_events_message_idx").on(t.relatedMessageId),
  ],
);

export type WhatsappWebhookEvent =
  typeof whatsappWebhookEvents.$inferSelect;
export type NewWhatsappWebhookEvent =
  typeof whatsappWebhookEvents.$inferInsert;
