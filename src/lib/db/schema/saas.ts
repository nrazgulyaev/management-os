/**
 * Stage 5.J — SaaS Foundation schemas.
 *
 * 7 new tables across 4 migrations:
 *   - organizations           tenant registry
 *   - api_keys                per-org bcrypt-hashed API keys
 *   - api_request_log         per-request audit
 *   - rate_limit_buckets      sliding-window rate limit state
 *   - webhook_subscriptions   per-org HMAC-signed webhook endpoints
 *   - webhook_delivery_log    per-attempt delivery audit
 *   - usage_metrics           per-org daily/weekly/monthly snapshots
 *   - data_export_requests    GDPR-compliant export workflow
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
  inet,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { documents } from "./documents";

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationCode: text("organization_code").notNull().unique(),
    name: text("name").notNull(),
    displayName: text("display_name"),
    description: text("description"),
    organizationType: text("organization_type").notNull(),
    countryCode: text("country_code").notNull().default("ID"),
    regionCode: text("region_code"),
    primaryCurrency: text("primary_currency").notNull().default("IDR"),
    primaryLanguage: text("primary_language").notNull().default("en"),
    timezone: text("timezone").notNull().default("Asia/Makassar"),
    subscriptionTier: text("subscription_tier").notNull().default("internal"),
    subscriptionStartedAt: date("subscription_started_at"),
    subscriptionExpiresAt: date("subscription_expires_at"),
    brandingConfig: jsonb("branding_config")
      .notNull()
      .default(sql`'{}'::jsonb`),
    enabledModules: jsonb("enabled_modules")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Stage 10.H — per-product access. text[] of product slugs.
     *  Allowed values: 'mgmt' (Management OS), 'dev' (Development OS).
     *  Default '{mgmt,dev}' preserves existing behaviour for every
     *  org that pre-dates 0091. See src/lib/products.ts for the
     *  runtime enum + helpers. */
    productsEnabled: text("products_enabled")
      .array()
      .notNull()
      .default(sql`ARRAY['mgmt', 'dev']`),
    /** Stage 10.I.5 — trial state machine. Set by /signup; flipped to
     *  'expired' by /api/cron/trial-status; flipped to 'converted' by
     *  the Stripe subscription webhook (Stage 10.L). 'none' for orgs
     *  provisioned before 10.I.5. See src/features/billing/trial-state.ts
     *  for the pure derivation helpers. */
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    trialStatus: text("trial_status").notNull().default("none"),
    maxUsers: integer("max_users"),
    maxProjects: integer("max_projects"),
    maxAiAgentInvocationsPerMonth: integer(
      "max_ai_agent_invocations_per_month",
    ),
    maxStorageGb: numeric("max_storage_gb", { precision: 10, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archiveReason: text("archive_reason"),
    notes: text("notes"),
  },
  (t) => [
    index("organizations_active_idx").on(t.isActive),
    index("organizations_type_idx").on(t.organizationType),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    keyLabel: text("key_label").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyLast4: text("key_last_4").notNull(),
    keyType: text("key_type").notNull().default("live"),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
    rateLimitPerHour: integer("rate_limit_per_hour").notNull().default(1000),
    rateLimitPerDay: integer("rate_limit_per_day").notNull().default(10000),
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    totalRequests: integer("total_requests").notNull().default(0),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => appUsers.id),
    revokedBy: uuid("revoked_by").references(() => appUsers.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("api_keys_organization_idx").on(t.organizationId),
    index("api_keys_prefix_idx").on(t.keyPrefix),
  ],
);

export const apiRequestLog = pgTable(
  "api_request_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    method: text("method").notNull(),
    endpoint: text("endpoint").notNull(),
    queryParams: jsonb("query_params"),
    requestSizeBytes: integer("request_size_bytes"),
    statusCode: integer("status_code").notNull(),
    responseSizeBytes: integer("response_size_bytes"),
    durationMs: integer("duration_ms"),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    rateLimitRemaining: integer("rate_limit_remaining"),
    wasRateLimited: boolean("was_rate_limited").notNull().default(false),
    errorMessage: text("error_message"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("api_request_log_key_idx").on(t.apiKeyId),
    index("api_request_log_organization_idx").on(t.organizationId),
    index("api_request_log_requested_idx").on(t.requestedAt),
    index("api_request_log_endpoint_idx").on(t.endpoint),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    windowType: text("window_type").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("rate_limit_buckets_key_idx").on(t.apiKeyId),
    index("rate_limit_buckets_window_idx").on(t.windowStart),
    uniqueIndex("rate_limit_buckets_key_window_unique").on(
      t.apiKeyId,
      t.windowType,
      t.windowStart,
    ),
  ],
);

export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    webhookLabel: text("webhook_label").notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    signingSecret: text("signing_secret").notNull(),
    subscribedEvents: text("subscribed_events").array().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastSuccessfulDeliveryAt: timestamp("last_successful_delivery_at", {
      withTimezone: true,
    }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    lastFailureReason: text("last_failure_reason"),
    autoDisabledAt: timestamp("auto_disabled_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => appUsers.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("webhook_subscriptions_organization_idx").on(t.organizationId)],
);

export const webhookDeliveryLog = pgTable(
  "webhook_delivery_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookSubscriptionId: uuid("webhook_subscription_id")
      .notNull()
      .references(() => webhookSubscriptions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    eventId: uuid("event_id").notNull(),
    eventPayload: jsonb("event_payload").notNull(),
    attemptNumber: integer("attempt_number").notNull().default(1),
    maxAttempts: integer("max_attempts").notNull().default(5),
    status: text("status").notNull().default("pending"),
    httpStatusCode: integer("http_status_code"),
    responseBody: text("response_body"),
    responseHeaders: jsonb("response_headers"),
    durationMs: integer("duration_ms"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("webhook_delivery_log_subscription_idx").on(t.webhookSubscriptionId),
    index("webhook_delivery_log_status_idx").on(t.status),
    index("webhook_delivery_log_event_idx").on(t.eventType),
  ],
);

export const usageMetrics = pgTable(
  "usage_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    metricPeriodStart: date("metric_period_start").notNull(),
    metricPeriodEnd: date("metric_period_end").notNull(),
    metricType: text("metric_type").notNull(),
    activeUsersCount: integer("active_users_count").notNull().default(0),
    activeProjectsCount: integer("active_projects_count").notNull().default(0),
    totalTransactionsCount: integer("total_transactions_count")
      .notNull()
      .default(0),
    totalInvoicesCount: integer("total_invoices_count").notNull().default(0),
    totalDocumentsUploaded: integer("total_documents_uploaded")
      .notNull()
      .default(0),
    totalStorageUsedBytes: bigint("total_storage_used_bytes", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    aiInvocationsCount: integer("ai_invocations_count").notNull().default(0),
    aiTokensConsumed: bigint("ai_tokens_consumed", { mode: "bigint" })
      .notNull()
      .default(0n),
    aiCostMinor: bigint("ai_cost_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    apiRequestsCount: integer("api_requests_count").notNull().default(0),
    apiRateLimitedCount: integer("api_rate_limited_count")
      .notNull()
      .default(0),
    webhooksDispatchedCount: integer("webhooks_dispatched_count")
      .notNull()
      .default(0),
    webhooksFailedCount: integer("webhooks_failed_count").notNull().default(0),
    pushNotificationsDispatched: integer("push_notifications_dispatched")
      .notNull()
      .default(0),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("usage_metrics_organization_idx").on(t.organizationId),
    index("usage_metrics_period_idx").on(
      t.metricPeriodStart,
      t.metricPeriodEnd,
    ),
    uniqueIndex("usage_metrics_org_period_type_unique").on(
      t.organizationId,
      t.metricPeriodStart,
      t.metricPeriodEnd,
      t.metricType,
    ),
  ],
);

export const dataExportRequests = pgTable(
  "data_export_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => appUsers.id),
    exportScope: text("export_scope").notNull(),
    customTables: text("custom_tables").array(),
    exportFormat: text("export_format").notNull().default("json"),
    status: text("status").notNull().default("pending"),
    outputDocumentId: uuid("output_document_id").references(() => documents.id),
    outputSizeBytes: bigint("output_size_bytes", { mode: "bigint" }),
    downloadUrl: text("download_url"),
    downloadExpiresAt: timestamp("download_expires_at", {
      withTimezone: true,
    }),
    downloadCount: integer("download_count").notNull().default(0),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("data_export_requests_organization_idx").on(t.organizationId),
    index("data_export_requests_status_idx").on(t.status),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type ApiRequestLog = typeof apiRequestLog.$inferSelect;
export type NewApiRequestLog = typeof apiRequestLog.$inferInsert;
export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type NewRateLimitBucket = typeof rateLimitBuckets.$inferInsert;
export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;
export type NewWebhookSubscription = typeof webhookSubscriptions.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveryLog.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveryLog.$inferInsert;
export type UsageMetric = typeof usageMetrics.$inferSelect;
export type NewUsageMetric = typeof usageMetrics.$inferInsert;
export type DataExportRequest = typeof dataExportRequests.$inferSelect;
export type NewDataExportRequest = typeof dataExportRequests.$inferInsert;
