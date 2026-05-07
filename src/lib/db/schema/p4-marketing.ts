/**
 * Stage 6.P4.A — Marketing schema (connections + campaigns + metrics).
 *
 * 3 of the 5 P4 tables (migration 0082). Attribution-side tables
 * (`attribution_touchpoints` + `attribution_conversions`) live in
 * `./attribution.ts`.
 *
 * Lives in `p4-marketing.ts` (not `marketing.ts`) to avoid colliding
 * with the existing Stage 5.E `marketing.ts` module which carries
 * `campaigns`, `leads`, `marketingLeadSources`, etc. The two
 * surfaces coexist; P4 is the unified provider-abstraction surface
 * driven by external ad platforms, while Stage 5.E is the
 * platform's internal lead intelligence.
 *
 * RLS: per-org isolation via is_in_user_organization() (Stage 5.J).
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
  numeric,
  date,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";

// ---------------------------------------------------------------------------
// marketing_connections
// ---------------------------------------------------------------------------
export const marketingConnections = pgTable(
  "marketing_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** MarketingProviderName */
    provider: text("provider").notNull(),

    externalAccountId: text("external_account_id").notNull(),
    accountName: text("account_name"),

    /** Encrypted credential blob (STAY_LINK_KMS_SECRET, P1.B helper). */
    credentials: jsonb("credentials"),

    /** ConnectionStatus FSM */
    status: text("status").notNull().default("pending"),

    autoSyncEnabled: boolean("auto_sync_enabled").notNull().default(true),
    syncFrequencyMinutes: integer("sync_frequency_minutes")
      .notNull()
      .default(360),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"),
    lastSyncError: text("last_sync_error"),
    lastSyncRecordsPulled: integer("last_sync_records_pulled"),

    connectedBy: uuid("connected_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archiveReason: text("archive_reason"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("marketing_connections_provider_account_unique").on(
      t.organizationId,
      t.provider,
      t.externalAccountId,
    ),
    index("marketing_connections_org_idx").on(t.organizationId),
    index("marketing_connections_provider_idx").on(t.provider),
  ],
);

// ---------------------------------------------------------------------------
// marketing_campaigns (P4 — distinct from Stage 5.E `campaigns`)
// ---------------------------------------------------------------------------
export const marketingCampaigns = pgTable(
  "marketing_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    marketingConnectionId: uuid("marketing_connection_id")
      .notNull()
      .references(() => marketingConnections.id, { onDelete: "cascade" }),

    externalCampaignId: text("external_campaign_id").notNull(),
    campaignName: text("campaign_name").notNull(),

    /** Platform tag — typically duplicates connection.provider. */
    platform: text("platform").notNull(),
    campaignType: text("campaign_type"),
    campaignObjective: text("campaign_objective"),

    /** CampaignStatus FSM */
    status: text("status").notNull(),

    startDate: date("start_date"),
    endDate: date("end_date"),

    budgetMinor: bigint("budget_minor", { mode: "bigint" }),
    budgetCurrency: text("budget_currency"),
    /** CampaignBudgetType FSM — daily / lifetime */
    budgetType: text("budget_type"),

    targetingSummary: jsonb("targeting_summary"),
    rawPayload: jsonb("raw_payload"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("marketing_campaigns_external_unique").on(
      t.marketingConnectionId,
      t.externalCampaignId,
    ),
    index("marketing_campaigns_connection_idx").on(t.marketingConnectionId),
    index("marketing_campaigns_status_idx").on(t.status),
    index("marketing_campaigns_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// marketing_metrics
// ---------------------------------------------------------------------------
export const marketingMetrics = pgTable(
  "marketing_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => marketingCampaigns.id, { onDelete: "cascade" }),

    metricDate: date("metric_date").notNull(),

    /** Spend in minor units (cents). Provider mappers normalize from
     *  micros / major / etc. before insert — DB never sees native units. */
    spendMinor: bigint("spend_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    spendCurrency: text("spend_currency").notNull(),

    impressions: bigint("impressions", { mode: "bigint" })
      .notNull()
      .default(0n),
    reach: bigint("reach", { mode: "bigint" }),
    frequency: numeric("frequency", { precision: 8, scale: 4 }),

    clicks: bigint("clicks", { mode: "bigint" }).notNull().default(0n),
    clickThroughRate: numeric("click_through_rate", { precision: 8, scale: 6 }),
    costPerClickMinor: bigint("cost_per_click_minor", { mode: "bigint" }),

    conversions: bigint("conversions", { mode: "bigint" })
      .notNull()
      .default(0n),
    conversionValueMinor: bigint("conversion_value_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    costPerConversionMinor: bigint("cost_per_conversion_minor", {
      mode: "bigint",
    }),
    returnOnAdSpend: numeric("return_on_ad_spend", { precision: 8, scale: 4 }),

    engagements: bigint("engagements", { mode: "bigint" }),
    videoViews: bigint("video_views", { mode: "bigint" }),
    videoWatchTimeSeconds: bigint("video_watch_time_seconds", {
      mode: "bigint",
    }),

    qualityScore: numeric("quality_score", { precision: 3, scale: 2 }),

    rawMetrics: jsonb("raw_metrics"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("marketing_metrics_campaign_date_unique").on(
      t.campaignId,
      t.metricDate,
    ),
    index("marketing_metrics_campaign_idx").on(t.campaignId),
    index("marketing_metrics_date_idx").on(t.metricDate),
    index("marketing_metrics_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// Type exports — P4-prefixed where Stage 5.E already owns the bare name.
// ---------------------------------------------------------------------------
export type MarketingConnection = typeof marketingConnections.$inferSelect;
export type NewMarketingConnection = typeof marketingConnections.$inferInsert;
export type P4MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type NewP4MarketingCampaign = typeof marketingCampaigns.$inferInsert;
export type P4MarketingMetric = typeof marketingMetrics.$inferSelect;
export type NewP4MarketingMetric = typeof marketingMetrics.$inferInsert;

// ---------------------------------------------------------------------------
// String-union types — mirror SQL CHECK constraints.
// ---------------------------------------------------------------------------

export type MarketingProviderName =
  | "google_analytics"
  | "google_ads"
  | "meta_pixel"
  | "meta_ads"
  | "tiktok_ads"
  | "mailchimp"
  | "convertkit"
  | "sendgrid_marketing"
  | "manual"
  | "other";

export const MARKETING_PROVIDERS: readonly MarketingProviderName[] = [
  "google_analytics",
  "google_ads",
  "meta_pixel",
  "meta_ads",
  "tiktok_ads",
  "mailchimp",
  "convertkit",
  "sendgrid_marketing",
  "manual",
  "other",
] as const;

export type MarketingConnectionStatus =
  | "pending"
  | "connecting"
  | "active"
  | "paused"
  | "error"
  | "archived";

export type CampaignStatus =
  | "active"
  | "paused"
  | "completed"
  | "draft"
  | "archived"
  | "unknown";

export type CampaignBudgetType = "daily" | "lifetime";

// Suppress unused-import lint for `sql` (kept for future expansion).
void sql;
