import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  bigint,
  numeric,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";

/**
 * Prompt 104 — Dynamic Pricing & Availability Rules.
 *
 * Nine tables form the engine: rule sets at the top, six rule
 * dimensions underneath, plus a quote log and a channel-push stub.
 * The legacy `rate_plans` family stays untouched; the dynamic engine
 * layers above it.
 */

export const pricingRuleSets = pgTable(
  "pricing_rule_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleSetCode: text("rule_set_code").notNull().unique(),
    name: text("name").notNull(),
    scopeType: text("scope_type").notNull(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    status: text("status").notNull().default("active"),
    priority: integer("priority").notNull().default(100),
    currency: text("currency").notNull().default("USD"),
    baseRateMinor: bigint("base_rate_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    minRateMinor: bigint("min_rate_minor", { mode: "bigint" }),
    maxRateMinor: bigint("max_rate_minor", { mode: "bigint" }),
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
    index("pricing_rule_sets_scope_idx").on(t.scopeType),
    index("pricing_rule_sets_project_idx").on(t.projectId),
    index("pricing_rule_sets_villa_idx").on(t.villaId),
    index("pricing_rule_sets_status_idx").on(t.status),
    index("pricing_rule_sets_priority_idx").on(t.priority),
  ],
);

export const pricingDayOfWeekRules = pgTable(
  "pricing_day_of_week_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => pricingRuleSets.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    modifierType: text("modifier_type").notNull(),
    modifierValueNumeric: numeric("modifier_value_numeric", {
      precision: 10,
      scale: 4,
    }),
    modifierAmountMinor: bigint("modifier_amount_minor", {
      mode: "bigint",
    }),
    minLos: integer("min_los"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("pricing_dow_rules_unique").on(t.ruleSetId, t.weekday),
  ],
);

export const pricingOccupancyRules = pgTable(
  "pricing_occupancy_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => pricingRuleSets.id, { onDelete: "cascade" }),
    occupancyMin: numeric("occupancy_min", { precision: 5, scale: 4 })
      .notNull(),
    occupancyMax: numeric("occupancy_max", { precision: 5, scale: 4 })
      .notNull(),
    modifierType: text("modifier_type").notNull(),
    modifierValueNumeric: numeric("modifier_value_numeric", {
      precision: 10,
      scale: 4,
    }),
    modifierAmountMinor: bigint("modifier_amount_minor", {
      mode: "bigint",
    }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("pricing_occupancy_rules_set_idx").on(t.ruleSetId)],
);

export const pricingCloseOutRules = pgTable(
  "pricing_close_out_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => pricingRuleSets.id, { onDelete: "cascade" }),
    daysBeforeCheckinMin: integer("days_before_checkin_min").notNull(),
    daysBeforeCheckinMax: integer("days_before_checkin_max").notNull(),
    modifierType: text("modifier_type").notNull(),
    modifierValueNumeric: numeric("modifier_value_numeric", {
      precision: 10,
      scale: 4,
    }),
    modifierAmountMinor: bigint("modifier_amount_minor", {
      mode: "bigint",
    }),
    minLos: integer("min_los"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("pricing_close_out_rules_set_idx").on(t.ruleSetId)],
);

export const pricingChannelRules = pgTable(
  "pricing_channel_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => pricingRuleSets.id, { onDelete: "cascade" }),
    channelKey: text("channel_key").notNull(),
    modifierType: text("modifier_type").notNull(),
    modifierValueNumeric: numeric("modifier_value_numeric", {
      precision: 10,
      scale: 4,
    }),
    modifierAmountMinor: bigint("modifier_amount_minor", {
      mode: "bigint",
    }),
    commissionModel: text("commission_model"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("pricing_channel_rules_unique").on(
      t.ruleSetId,
      t.channelKey,
    ),
  ],
);

export const pricingMinStayRules = pgTable(
  "pricing_min_stay_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => pricingRuleSets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    weekdayMask: integer("weekday_mask").array(),
    minLos: integer("min_los").notNull(),
    maxLos: integer("max_los"),
    priority: integer("priority").notNull().default(100),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pricing_min_stay_rules_set_idx").on(t.ruleSetId),
    index("pricing_min_stay_rules_priority_idx").on(t.priority),
  ],
);

export const pricingStopSellRules = pgTable(
  "pricing_stop_sell_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => pricingRuleSets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    reason: text("reason").notNull(),
    channelKey: text("channel_key"),
    status: text("status").notNull().default("active"),
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
    index("pricing_stop_sell_rules_set_idx").on(t.ruleSetId),
    index("pricing_stop_sell_rules_dates_idx").on(t.startsOn, t.endsOn),
  ],
);

export const pricingQuoteLogs = pgTable(
  "pricing_quote_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    channelKey: text("channel_key").notNull().default("direct"),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    nights: integer("nights").notNull(),
    available: boolean("available").notNull(),
    reason: text("reason"),
    totalMinor: bigint("total_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    currency: text("currency").notNull(),
    requestIpHash: text("request_ip_hash"),
    userAgentHash: text("user_agent_hash"),
    publicQuote: boolean("public_quote").notNull().default(false),
    ruleSetId: uuid("rule_set_id").references(() => pricingRuleSets.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pricing_quote_logs_villa_idx").on(t.villaId, t.createdAt),
    index("pricing_quote_logs_channel_idx").on(t.channelKey),
    index("pricing_quote_logs_public_idx").on(t.publicQuote),
  ],
);

export const channelPushEvents = pgTable(
  "channel_push_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventCode: text("event_code").notNull().unique(),
    eventType: text("event_type").notNull(),
    channelKey: text("channel_key").notNull(),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    dateStart: date("date_start").notNull(),
    dateEnd: date("date_end").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    status: text("status").notNull().default("simulated"),
    errorMessage: text("error_message"),
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
    index("channel_push_events_channel_idx").on(t.channelKey),
    index("channel_push_events_villa_idx").on(t.villaId),
    index("channel_push_events_status_idx").on(t.status),
    index("channel_push_events_dates_idx").on(t.dateStart, t.dateEnd),
  ],
);

export type PricingRuleSet = typeof pricingRuleSets.$inferSelect;
export type NewPricingRuleSet = typeof pricingRuleSets.$inferInsert;
export type PricingDayOfWeekRule =
  typeof pricingDayOfWeekRules.$inferSelect;
export type PricingOccupancyRule =
  typeof pricingOccupancyRules.$inferSelect;
export type PricingCloseOutRule =
  typeof pricingCloseOutRules.$inferSelect;
export type PricingChannelRule =
  typeof pricingChannelRules.$inferSelect;
export type PricingMinStayRule =
  typeof pricingMinStayRules.$inferSelect;
export type PricingStopSellRule =
  typeof pricingStopSellRules.$inferSelect;
export type PricingQuoteLog = typeof pricingQuoteLogs.$inferSelect;
export type NewPricingQuoteLog = typeof pricingQuoteLogs.$inferInsert;
export type ChannelPushEvent = typeof channelPushEvents.$inferSelect;
export type NewChannelPushEvent = typeof channelPushEvents.$inferInsert;
