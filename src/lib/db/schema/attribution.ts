/**
 * Stage 6.P4.A — Attribution schema (touchpoints + conversions).
 *
 * 2 of the 5 P4 tables (migration 0082). Decoupled from the
 * `p4-marketing.ts` campaign + metrics surface so the attribution
 * engine can read its own data without dragging in ad-platform
 * imports.
 *
 * RLS: per-org isolation via is_in_user_organization() (Stage 5.J).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { contacts } from "./contacts";
import { marketingCampaigns } from "./p4-marketing";

// ---------------------------------------------------------------------------
// attribution_touchpoints — append-only
// ---------------------------------------------------------------------------
export const attributionTouchpoints = pgTable(
  "attribution_touchpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Per-visit id (analytics session). */
    sessionId: text("session_id"),
    /** Per-device id (GA4 client_id / Meta _fbp). */
    clientId: text("client_id"),
    /** External user id when authenticated. */
    userExternalId: text("user_external_id"),

    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),

    touchpointAt: timestamp("touchpoint_at", { withTimezone: true }).notNull(),

    /** TouchpointChannel FSM */
    channel: text("channel").notNull(),

    source: text("source"),
    medium: text("medium"),
    campaign: text("campaign"),
    content: text("content"),
    term: text("term"),
    referrerUrl: text("referrer_url"),
    landingUrl: text("landing_url"),

    /** Linked campaign — populated when the engine matches the UTM
     *  campaign to a `marketing_campaigns` row. */
    campaignId: uuid("campaign_id").references(() => marketingCampaigns.id, {
      onDelete: "set null",
    }),

    userAgent: text("user_agent"),
    deviceType: text("device_type"),
    country: text("country"),
    rawPayload: jsonb("raw_payload"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("attribution_touchpoints_session_idx").on(t.sessionId),
    index("attribution_touchpoints_client_idx").on(t.clientId),
    index("attribution_touchpoints_at_idx").on(t.touchpointAt),
    index("attribution_touchpoints_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// attribution_conversions
// ---------------------------------------------------------------------------
export const attributionConversions = pgTable(
  "attribution_conversions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** ConversionType FSM */
    conversionType: text("conversion_type").notNull(),

    /** Soft links — different schema modules own these tables. */
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    linkedReservationId: uuid("linked_reservation_id"),
    linkedDealId: uuid("linked_deal_id"),
    linkedLeadId: uuid("linked_lead_id"),

    conversionValueMinor: bigint("conversion_value_minor", { mode: "bigint" }),
    conversionCurrency: text("conversion_currency"),

    convertedAt: timestamp("converted_at", { withTimezone: true }).notNull(),

    /** Attribution result — populated by the engine. NULL until the
     *  engine has run for this conversion. */
    firstTouchCampaignId: uuid("first_touch_campaign_id").references(
      () => marketingCampaigns.id,
      { onDelete: "set null" },
    ),
    lastTouchCampaignId: uuid("last_touch_campaign_id").references(
      () => marketingCampaigns.id,
      { onDelete: "set null" },
    ),
    /** Per-campaign weighted credit, JSON shape:
     *  [{ campaignId, weight, creditValueMinor }] */
    linearAttributionData: jsonb("linear_attribution_data"),

    daysToConvert: integer("days_to_convert"),
    touchpointCount: integer("touchpoint_count"),

    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("attribution_conversions_org_idx").on(t.organizationId),
    index("attribution_conversions_at_idx").on(t.convertedAt),
    index("attribution_conversions_type_idx").on(t.conversionType),
  ],
);

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------
export type AttributionTouchpointRow =
  typeof attributionTouchpoints.$inferSelect;
export type NewAttributionTouchpointRow =
  typeof attributionTouchpoints.$inferInsert;
export type AttributionConversionRow =
  typeof attributionConversions.$inferSelect;
export type NewAttributionConversionRow =
  typeof attributionConversions.$inferInsert;

// ---------------------------------------------------------------------------
// String-union types — mirror SQL CHECK constraints.
// ---------------------------------------------------------------------------

export type TouchpointChannel =
  | "organic_search"
  | "paid_search"
  | "organic_social"
  | "paid_social"
  | "email"
  | "direct"
  | "referral"
  | "display"
  | "video"
  | "affiliate"
  | "other";

export const TOUCHPOINT_CHANNELS: readonly TouchpointChannel[] = [
  "organic_search",
  "paid_search",
  "organic_social",
  "paid_social",
  "email",
  "direct",
  "referral",
  "display",
  "video",
  "affiliate",
  "other",
] as const;

export type ConversionType =
  | "lead_created"
  | "reservation_booked"
  | "deal_closed"
  | "investor_committed"
  | "newsletter_signup"
  | "inquiry_submitted"
  | "tour_scheduled"
  | "custom";

export const CONVERSION_TYPES: readonly ConversionType[] = [
  "lead_created",
  "reservation_booked",
  "deal_closed",
  "investor_committed",
  "newsletter_signup",
  "inquiry_submitted",
  "tour_scheduled",
  "custom",
] as const;
