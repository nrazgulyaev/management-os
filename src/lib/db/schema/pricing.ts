import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  bigint,
  integer,
  numeric,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects, villas } from "./projects";
import { appUsers } from "./identity";
import { organizations } from "./saas";

/**
 * V9B — basic rate-plan primitive. Used by `quoteForRange` (pure) and by
 * the owner-stay estimator. Future v9C+ will hook PriceLabs as another
 * `source` for `rate_plan_overrides`.
 */

export const ratePlans = pgTable(
  "rate_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseCurrency: text("base_currency").notNull().default("USD"),
    baseNightlyRateMinor: bigint("base_nightly_rate_minor", { mode: "number" })
      .notNull()
      .default(0),
    managementFeePercent: numeric("management_fee_percent"),
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
    index("rate_plans_villa_idx").on(t.villaId),
    index("rate_plans_project_idx").on(t.projectId),
    index("rate_plans_status_idx").on(t.status),
    index("rate_plans_org_idx").on(t.organizationId),
  ],
);

export const ratePlanSeasons = pgTable(
  "rate_plan_seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references(() => ratePlans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    multiplier: numeric("multiplier").notNull().default("1"),
    nightlyRateMinor: bigint("nightly_rate_minor", { mode: "number" }),
    minLos: integer("min_los"),
    maxLos: integer("max_los"),
    stopSell: boolean("stop_sell").notNull().default(false),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("rate_plan_seasons_plan_idx").on(t.ratePlanId, t.startsOn),
    index("rate_plan_seasons_status_idx").on(t.status),
    index("rate_plan_seasons_org_idx").on(t.organizationId),
  ],
);

export const ratePlanOverrides = pgTable(
  "rate_plan_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references(() => ratePlans.id, { onDelete: "cascade" }),
    stayDate: date("stay_date").notNull(),
    nightlyRateMinor: bigint("nightly_rate_minor", { mode: "number" }),
    minLos: integer("min_los"),
    stopSell: boolean("stop_sell").notNull().default(false),
    source: text("source").notNull().default("manual"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("rate_plan_overrides_unique").on(t.ratePlanId, t.stayDate),
    index("rate_plan_overrides_org_idx").on(t.organizationId),
  ],
);

export type RatePlan = typeof ratePlans.$inferSelect;
export type NewRatePlan = typeof ratePlans.$inferInsert;
export type RatePlanSeason = typeof ratePlanSeasons.$inferSelect;
export type NewRatePlanSeason = typeof ratePlanSeasons.$inferInsert;
export type RatePlanOverride = typeof ratePlanOverrides.$inferSelect;
export type NewRatePlanOverride = typeof ratePlanOverrides.$inferInsert;
