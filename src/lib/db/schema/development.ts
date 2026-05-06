import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects, villas } from "./projects";

/**
 * Development OS — Stage 2.1 schema.
 *
 * Strict 1:1 extension pattern: Management OS owns `projects` and `villas`;
 * Development OS adds metadata in extension tables so the Management OS read
 * paths are never affected.
 *
 * Money is stored as BIGINT minor units of an explicit currency, mirroring
 * the existing finance ledger (`revenueLines`, `expenseLines`, …).
 *
 * See `docs/development-os-architecture.md` for the long-running schema
 * contract across stages 2.1 → 2.4.
 */

export const developmentProjectMeta = pgTable(
  "development_project_meta",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: "cascade" }),
    // 'leasehold' | 'freehold' | 'joint_venture' | 'mixed'
    acquisitionMode: text("acquisition_mode").notNull().default("leasehold"),
    leaseTenureYears: integer("lease_tenure_years"),
    leaseStartDate: date("lease_start_date"),
    leaseEndDate: date("lease_end_date"),
    landAreaSqm: numeric("land_area_sqm", { precision: 14, scale: 2 }),
    /** Generated columns kept in app for portability — see migration. */
    landAreaAres: numeric("land_area_ares", { precision: 14, scale: 2 }),
    landAreaAcres: numeric("land_area_acres", { precision: 14, scale: 4 }),
    grossSquareMeters: numeric("gross_square_meters", { precision: 14, scale: 2 }),
    netSquareMeters: numeric("net_square_meters", { precision: 14, scale: 2 }),
    acquisitionDate: date("acquisition_date"),
    plannedHandoverDate: date("planned_handover_date"),
    projectCurrency: text("project_currency").notNull().default("USD"),
    operationalCurrency: text("operational_currency").notNull().default("IDR"),
    priceEscalationRulePresent: boolean("price_escalation_rule_present")
      .notNull()
      .default(false),
    /** Stage 2.3.B — set by `runSelfSustainingThresholdCheck`. */
    isSelfSustaining: boolean("is_self_sustaining").notNull().default(false),
    lastSelfSustainingCheckAt: timestamp("last_self_sustaining_check_at", {
      withTimezone: true,
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const projectPhases = pgTable(
  "project_phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** 'land_sourcing' | 'due_diligence' | 'design' | 'permits' | 'pre_sales'
     *  | 'under_construction' | 'pre_handover' | 'handover' | 'managed' | 'archived' */
    phaseType: text("phase_type").notNull(),
    /** 'not_started' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled' */
    status: text("status").notNull().default("not_started"),
    plannedStartDate: date("planned_start_date"),
    actualStartDate: date("actual_start_date"),
    plannedEndDate: date("planned_end_date"),
    actualEndDate: date("actual_end_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_phases_project_idx").on(t.projectId, t.phaseType),
    /** At most one in_progress row per (project, phaseType). Enforced as a
     *  partial unique index in the migration. */
    uniqueIndex("project_phases_active_unique")
      .on(t.projectId, t.phaseType)
      .where(sql`status = 'in_progress'`),
  ],
);

export const landPlots = pgTable(
  "land_plots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    plotCode: text("plot_code").notNull(),
    acquisitionMode: text("acquisition_mode").notNull().default("leasehold"),
    /** DEPRECATED in 2.2.A — kept one sub-stage for backwards-compat,
     *  drop in 2.4. New code reads `ownerContactId` instead. */
    ownerContactName: text("owner_contact_name"),
    /** 2.2.A — normalized landowner contact, populated by the 0035
     *  backfill migration. NULL on plots with no recorded contact. */
    ownerContactId: uuid("owner_contact_id"),
    areaSqm: numeric("area_sqm", { precision: 14, scale: 2 }),
    geoCoordinates: jsonb("geo_coordinates"),
    acquisitionDate: date("acquisition_date"),
    purchasePriceMinor: bigint("purchase_price_minor", { mode: "bigint" }),
    purchaseCurrency: text("purchase_currency"),
    upfrontAmountMinor: bigint("upfront_amount_minor", { mode: "bigint" }),
    /** [{ amount, currency, dueDate, status, paidAt }] */
    balanceInstallments: jsonb("balance_installments"),
    leaseStartDate: date("lease_start_date"),
    leaseEndDate: date("lease_end_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("land_plots_project_idx").on(t.projectId),
    uniqueIndex("land_plots_project_code_uniq").on(t.projectId, t.plotCode),
  ],
);

export const unitTypes = pgTable(
  "unit_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** { bedrooms, bathrooms, hasPool, livingRooms, ... } */
    specJson: jsonb("spec_json").notNull().default(sql`'{}'::jsonb`),
    basePlotAreaSqm: numeric("base_plot_area_sqm", { precision: 14, scale: 2 }),
    baseBuildingAreaSqm: numeric("base_building_area_sqm", { precision: 14, scale: 2 }),
    basePriceMinor: bigint("base_price_minor", { mode: "bigint" }),
    basePriceCurrency: text("base_price_currency"),
    description: text("description"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("unit_types_project_idx").on(t.projectId),
    uniqueIndex("unit_types_project_name_uniq").on(t.projectId, t.name),
  ],
);

export const unitDevelopmentMeta = pgTable(
  "unit_development_meta",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .unique()
      .references(() => villas.id, { onDelete: "cascade" }),
    unitTypeId: uuid("unit_type_id").references(() => unitTypes.id, {
      onDelete: "set null",
    }),
    /** 'villa' | 'apartment' | 'townhouse' | 'commercial_retail'
     *  | 'commercial_restaurant' | 'commercial_spa' | 'commercial_office' */
    unitCategory: text("unit_category").notNull().default("villa"),
    locationCoefficient: numeric("location_coefficient", { precision: 6, scale: 3 })
      .notNull()
      .default("1.000"),
    locationDescription: text("location_description"),
    positionMetadata: jsonb("position_metadata"),
    /** 'planning' | 'foundation' | 'structure' | 'mep' | 'finishing'
     *  | 'completed' | 'handed_over' */
    constructionStatus: text("construction_status").notNull().default("planning"),
    constructionProgressPercent: numeric("construction_progress_percent", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0"),
    costBasisMinor: bigint("cost_basis_minor", { mode: "bigint" }),
    costBasisCurrency: text("cost_basis_currency"),
    targetSalePriceMinor: bigint("target_sale_price_minor", { mode: "bigint" }),
    targetSaleCurrency: text("target_sale_currency"),
    currentMarketPriceMinor: bigint("current_market_price_minor", { mode: "bigint" }),
    currentMarketCurrency: text("current_market_currency"),
    contractPriceMinor: bigint("contract_price_minor", { mode: "bigint" }),
    contractCurrency: text("contract_currency"),
    unitTypeFrozen: boolean("unit_type_frozen").notNull().default(false),
    overrideBuildingAreaSqm: numeric("override_building_area_sqm", {
      precision: 14,
      scale: 2,
    }),
    overridePlotAreaSqm: numeric("override_plot_area_sqm", {
      precision: 14,
      scale: 2,
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("unit_development_meta_unit_type_idx").on(t.unitTypeId),
    index("unit_development_meta_status_idx").on(t.constructionStatus),
  ],
);

export type DevelopmentProjectMeta = typeof developmentProjectMeta.$inferSelect;
export type NewDevelopmentProjectMeta = typeof developmentProjectMeta.$inferInsert;
export type ProjectPhase = typeof projectPhases.$inferSelect;
export type NewProjectPhase = typeof projectPhases.$inferInsert;
export type LandPlot = typeof landPlots.$inferSelect;
export type NewLandPlot = typeof landPlots.$inferInsert;
export type UnitType = typeof unitTypes.$inferSelect;
export type NewUnitType = typeof unitTypes.$inferInsert;
export type UnitDevelopmentMeta = typeof unitDevelopmentMeta.$inferSelect;
export type NewUnitDevelopmentMeta = typeof unitDevelopmentMeta.$inferInsert;
