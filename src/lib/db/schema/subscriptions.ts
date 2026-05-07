import { sql } from "drizzle-orm";
import {
  bigint,
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";

/**
 * Stage 7.B — Subscription plans + feature gating.
 *
 * 5 tables:
 *   - subscriptionPlans            plan catalog
 *   - featureFlags                 granular feature catalog
 *   - planFeatures                 (plan, flag) mapping with limit_value
 *   - orgSubscriptions             per-org active subscription + lifecycle
 *   - subscriptionLifecycleEvents  audit log of FSM transitions
 */

export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planCode: text("plan_code").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    tierRank: integer("tier_rank").notNull(),
    monthlyPriceMinor: bigint("monthly_price_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    annualPriceMinor: bigint("annual_price_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("USD"),
    stripeProductId: text("stripe_product_id"),
    stripeMonthlyPriceId: text("stripe_monthly_price_id"),
    stripeAnnualPriceId: text("stripe_annual_price_id"),
    trialPeriodDays: integer("trial_period_days").notNull().default(0),
    defaultGracePeriodDays: integer("default_grace_period_days")
      .notNull()
      .default(3),
    defaultArchiveAfterDays: integer("default_archive_after_days")
      .notNull()
      .default(30),
    defaultPurgeAfterDays: integer("default_purge_after_days")
      .notNull()
      .default(90),
    isActive: boolean("is_active").notNull().default(true),
    isInternal: boolean("is_internal").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    metadata: jsonb("metadata"),
    // Stage 7.0 retrofit (migration 0086): AI-routing metadata.
    /** Markup % over actual API cost for billing. 0 = pass-through. */
    markupPercent: integer("markup_percent").notNull().default(0),
    /** Tier ceiling for AI agents on this plan (1, 2, or 3). */
    maxTier: integer("max_tier").notNull().default(1),
    /** Allowlist of agent codes available on this plan. Empty = all enabled. */
    enabledAgentCodes: text("enabled_agent_codes")
      .array()
      .notNull()
      .default(sql`ARRAY[]::TEXT[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("subscription_plans_active_idx").on(t.isActive),
    index("subscription_plans_tier_idx").on(t.tierRank),
  ],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flagCode: text("flag_code").notNull().unique(),
    category: text("category").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    isNumericLimit: boolean("is_numeric_limit").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("feature_flags_category_idx").on(t.category),
    index("feature_flags_active_idx").on(t.isActive),
  ],
);

export const planFeatures = pgTable(
  "plan_features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planCode: text("plan_code")
      .notNull()
      .references(() => subscriptionPlans.planCode, { onDelete: "cascade" }),
    flagCode: text("flag_code")
      .notNull()
      .references(() => featureFlags.flagCode, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    limitValue: bigint("limit_value", { mode: "bigint" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("plan_features_plan_flag_unique").on(t.planCode, t.flagCode),
    index("plan_features_plan_idx").on(t.planCode),
    index("plan_features_flag_idx").on(t.flagCode),
  ],
);

export const orgSubscriptions = pgTable(
  "org_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planCode: text("plan_code")
      .notNull()
      .references(() => subscriptionPlans.planCode),
    billingCycle: text("billing_cycle").notNull().default("monthly"),
    status: text("status").notNull().default("trial"),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStartsAt: timestamp("current_period_starts_at", {
      withTimezone: true,
    }),
    currentPeriodEndsAt: timestamp("current_period_ends_at", {
      withTimezone: true,
    }),
    gracePeriodEndsAt: timestamp("grace_period_ends_at", {
      withTimezone: true,
    }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    reactivatedAt: timestamp("reactivated_at", { withTimezone: true }),
    reactivationCount: integer("reactivation_count").notNull().default(0),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCustomerId: text("stripe_customer_id"),
    stripePriceId: text("stripe_price_id"),
    isInternalComp: boolean("is_internal_comp").notNull().default(false),
    autoRenew: boolean("auto_renew").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("org_subscriptions_org_idx").on(t.organizationId),
    index("org_subscriptions_status_idx").on(t.status),
    index("org_subscriptions_period_end_idx").on(t.currentPeriodEndsAt),
    index("org_subscriptions_grace_end_idx").on(t.gracePeriodEndsAt),
  ],
);

export const subscriptionLifecycleEvents = pgTable(
  "subscription_lifecycle_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id"),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorUserId: uuid("actor_user_id"),
    actorKind: text("actor_kind").notNull().default("system"),
    payload: jsonb("payload"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("subscription_lifecycle_events_org_idx").on(t.organizationId),
    index("subscription_lifecycle_events_sub_idx").on(t.subscriptionId),
    index("subscription_lifecycle_events_event_idx").on(t.eventType),
    index("subscription_lifecycle_events_occurred_idx").on(t.occurredAt),
  ],
);

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
export type PlanFeature = typeof planFeatures.$inferSelect;
export type NewPlanFeature = typeof planFeatures.$inferInsert;
export type OrgSubscription = typeof orgSubscriptions.$inferSelect;
export type NewOrgSubscription = typeof orgSubscriptions.$inferInsert;
export type SubscriptionLifecycleEvent =
  typeof subscriptionLifecycleEvents.$inferSelect;
