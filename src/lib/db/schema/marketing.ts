/**
 * Stage 5.E — Marketing Intelligence schemas.
 *
 * 8 tables across 3 migrations:
 *   - marketing_lead_sources      channel registry (14 default seeds)
 *   - leads                       lead pipeline with attribution
 *   - campaigns                   marketing campaigns
 *   - campaign_costs              per-period channel cost tracking
 *   - content_pieces              content pipeline (9-state workflow)
 *   - content_variants            per-language/platform/audience variants
 *   - sales_conversation_threads  aggregated conversations (consent-gated AI)
 *   - manager_performance_metrics weekly/monthly/quarterly snapshots
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  bigint,
  integer,
  numeric,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { appUsers } from "./identity";
import { documents } from "./documents";
import { contacts } from "./contacts";
import { agentOutputs } from "./ai-agents";
import { devTransactions } from "./dev-finance";
import { organizations } from "./saas";

export const marketingLeadSources = pgTable(
  "marketing_lead_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKey: text("source_key").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    channelType: text("channel_type").notNull(),
    platform: text("platform"),
    isPaid: boolean("is_paid").notNull().default(false),
    defaultAttributionModel: text("default_attribution_model"),
    utmSourceDefault: text("utm_source_default"),
    utmMediumDefault: text("utm_medium_default"),
    hasExternalCostData: boolean("has_external_cost_data")
      .notNull()
      .default(false),
    costDataSource: text("cost_data_source"),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    iconKey: text("icon_key"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("marketing_lead_sources_active_idx").on(t.isActive),
    index("marketing_lead_sources_channel_idx").on(t.channelType),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    campaignCode: text("campaign_code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    projectIds: uuid("project_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    campaignObjective: text("campaign_objective").notNull(),
    primaryChannels: text("primary_channels")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    totalBudgetMinor: bigint("total_budget_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    spentToDateMinor: bigint("spent_to_date_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    currency: text("currency").notNull().default("IDR"),
    campaignStart: date("campaign_start").notNull(),
    campaignEnd: date("campaign_end").notNull(),
    targetAudienceDescription: text("target_audience_description"),
    geographicFocus: text("geographic_focus")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    languageFocus: text("language_focus")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    targetLeads: integer("target_leads"),
    targetQualifiedLeads: integer("target_qualified_leads"),
    targetReservations: integer("target_reservations"),
    targetRevenueMinor: bigint("target_revenue_minor", { mode: "bigint" }),
    status: text("status").notNull().default("planned"),
    managedBy: uuid("managed_by").references(() => appUsers.id),
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaigns_status_idx").on(t.status),
    index("campaigns_period_idx").on(t.campaignStart, t.campaignEnd),
    index("campaigns_objective_idx").on(t.campaignObjective),
  ],
);

export const campaignCosts = pgTable(
  "campaign_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    sourceKey: text("source_key").notNull(),
    costMinor: bigint("cost_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    impressions: integer("impressions"),
    clicks: integer("clicks"),
    conversions: integer("conversions"),
    ctr: numeric("ctr", { precision: 7, scale: 4 }),
    cpc: numeric("cpc", { precision: 15, scale: 2 }),
    dataSource: text("data_source").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    sourceRecordId: text("source_record_id"),
    relatedTransactionId: uuid("related_transaction_id").references(
      () => devTransactions.id,
    ),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_costs_campaign_idx").on(t.campaignId),
    index("campaign_costs_source_idx").on(t.sourceKey),
    index("campaign_costs_period_idx").on(t.periodStart, t.periodEnd),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadCode: text("lead_code").notNull().unique(),
    contactId: uuid("contact_id").references(() => contacts.id),
    projectId: uuid("project_id").references(() => projects.id),
    lifecycleStatus: text("lifecycle_status").notNull().default("lead"),
    lifecycleStatusChangedAt: timestamp("lifecycle_status_changed_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    assignedManagerId: uuid("assigned_manager_id").references(() => appUsers.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    leadSourceKey: text("lead_source_key").references(
      () => marketingLeadSources.sourceKey,
    ),
    firstTouchSourceKey: text("first_touch_source_key"),
    lastTouchSourceKey: text("last_touch_source_key"),
    attributionPath: jsonb("attribution_path"),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    firstTouchAt: timestamp("first_touch_at", { withTimezone: true }),
    attributionData: jsonb("attribution_data"),
    estimatedValueMinor: bigint("estimated_value_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("IDR"),
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leads_source_idx").on(t.leadSourceKey),
    index("leads_campaign_idx").on(t.campaignId),
    index("leads_status_idx").on(t.lifecycleStatus),
    index("leads_manager_idx").on(t.assignedManagerId),
    index("leads_contact_idx").on(t.contactId),
  ],
);

export const contentPieces = pgTable(
  "content_pieces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    contentCode: text("content_code").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    contentType: text("content_type").notNull(),
    relatedProjectIds: uuid("related_project_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    relatedCampaignId: uuid("related_campaign_id").references(() => campaigns.id),
    contentBrief: text("content_brief").notNull(),
    targetAudience: text("target_audience"),
    keyMessages: text("key_messages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    primaryLanguage: text("primary_language").notNull().default("en"),
    availableLanguages: text("available_languages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    primaryAssetId: uuid("primary_asset_id").references(() => documents.id),
    supportingAssetIds: uuid("supporting_asset_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    caption: text("caption"),
    hashtags: text("hashtags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    callToAction: text("call_to_action"),
    linkUrl: text("link_url"),
    status: text("status").notNull().default("draft"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => appUsers.id),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => appUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    scheduledPublishAt: timestamp("scheduled_publish_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    externalPostUrl: text("external_post_url"),
    externalPostId: text("external_post_id"),
    aiAssistedCreation: boolean("ai_assisted_creation").notNull().default(false),
    aiMarketingAssistantOutputId: uuid("ai_marketing_assistant_output_id").references(
      () => agentOutputs.id,
    ),
    performanceMetrics: jsonb("performance_metrics"),
    performanceLastUpdated: timestamp("performance_last_updated", {
      withTimezone: true,
    }),
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("content_pieces_status_idx").on(t.status),
    index("content_pieces_type_idx").on(t.contentType),
    index("content_pieces_campaign_idx").on(t.relatedCampaignId),
  ],
);

export const contentVariants = pgTable(
  "content_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    parentContentId: uuid("parent_content_id")
      .notNull()
      .references(() => contentPieces.id, { onDelete: "cascade" }),
    variantType: text("variant_type").notNull(),
    variantLabel: text("variant_label").notNull(),
    languageCode: text("language_code"),
    platformTarget: text("platform_target"),
    caption: text("caption"),
    hashtags: text("hashtags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    callToAction: text("call_to_action"),
    linkUrl: text("link_url"),
    primaryAssetId: uuid("primary_asset_id").references(() => documents.id),
    variantStatus: text("variant_status").notNull().default("draft"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("content_variants_parent_idx").on(t.parentContentId),
    index("content_variants_status_idx").on(t.variantStatus),
  ],
);

export const salesConversationThreads = pgTable(
  "sales_conversation_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    threadCode: text("thread_code").notNull().unique(),
    leadId: uuid("lead_id").references(() => leads.id),
    buyerId: uuid("buyer_id"),
    primarySalesManagerId: uuid("primary_sales_manager_id").references(
      () => appUsers.id,
    ),
    channelTypes: text("channel_types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    conversationStartAt: timestamp("conversation_start_at", { withTimezone: true })
      .notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
    totalMessageCount: integer("total_message_count").notNull().default(0),
    outcome: text("outcome"),
    outcomeRecordedAt: timestamp("outcome_recorded_at", { withTimezone: true }),
    aiAnalysisStatus: text("ai_analysis_status").notNull().default("not_analyzed"),
    aiAnalysisOutputId: uuid("ai_analysis_output_id").references(
      () => agentOutputs.id,
    ),
    consentToAnalyze: boolean("consent_to_analyze").notNull().default(false),
    consentRecordedAt: timestamp("consent_recorded_at", { withTimezone: true }),
    consentRecordedBy: uuid("consent_recorded_by").references(() => appUsers.id),
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sales_conversation_threads_lead_idx").on(t.leadId),
    index("sales_conversation_threads_manager_idx").on(t.primarySalesManagerId),
    index("sales_conversation_threads_outcome_idx").on(t.outcome),
    index("sales_conversation_threads_period_idx").on(t.conversationStartAt),
  ],
);

export const managerPerformanceMetrics = pgTable(
  "manager_performance_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    managerId: uuid("manager_id")
      .notNull()
      .references(() => appUsers.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    periodType: text("period_type").notNull(),
    totalLeadsAssigned: integer("total_leads_assigned").notNull().default(0),
    totalConversationsActive: integer("total_conversations_active")
      .notNull()
      .default(0),
    totalMessagesSent: integer("total_messages_sent").notNull().default(0),
    totalCallsMade: integer("total_calls_made").notNull().default(0),
    averageResponseTimeMinutes: numeric("average_response_time_minutes", {
      precision: 10,
      scale: 2,
    }),
    medianResponseTimeMinutes: numeric("median_response_time_minutes", {
      precision: 10,
      scale: 2,
    }),
    longestResponseTimeHours: numeric("longest_response_time_hours", {
      precision: 10,
      scale: 2,
    }),
    reservationsSecured: integer("reservations_secured").notNull().default(0),
    contractsSigned: integer("contracts_signed").notNull().default(0),
    leadsLost: integer("leads_lost").notNull().default(0),
    leadToReservationRate: numeric("lead_to_reservation_rate", {
      precision: 5,
      scale: 2,
    }),
    reservationToContractRate: numeric("reservation_to_contract_rate", {
      precision: 5,
      scale: 2,
    }),
    missedFollowupsCount: integer("missed_followups_count").notNull().default(0),
    unrespondedMessagesCount: integer("unresponded_messages_count")
      .notNull()
      .default(0),
    flaggedConversationsCount: integer("flagged_conversations_count")
      .notNull()
      .default(0),
    aiQualityScore: numeric("ai_quality_score", { precision: 5, scale: 2 }),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("manager_performance_metrics_manager_idx").on(t.managerId),
    index("manager_performance_metrics_period_idx").on(t.periodStart, t.periodEnd),
    uniqueIndex("manager_performance_metrics_manager_period_unique").on(
      t.managerId,
      t.periodStart,
      t.periodEnd,
      t.periodType,
    ),
  ],
);

export type MarketingLeadSource = typeof marketingLeadSources.$inferSelect;
export type NewMarketingLeadSource = typeof marketingLeadSources.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type CampaignCost = typeof campaignCosts.$inferSelect;
export type NewCampaignCost = typeof campaignCosts.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type ContentPiece = typeof contentPieces.$inferSelect;
export type NewContentPiece = typeof contentPieces.$inferInsert;
export type ContentVariant = typeof contentVariants.$inferSelect;
export type NewContentVariant = typeof contentVariants.$inferInsert;
export type SalesConversationThread = typeof salesConversationThreads.$inferSelect;
export type NewSalesConversationThread = typeof salesConversationThreads.$inferInsert;
export type ManagerPerformanceMetric = typeof managerPerformanceMetrics.$inferSelect;
export type NewManagerPerformanceMetric = typeof managerPerformanceMetrics.$inferInsert;
