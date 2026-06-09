/**
 * Stage 4.B.2 — Residual inventory units (unsold villas after project
 * completion) + per-unit ownership shares between Arconique and investors.
 *
 * The "units" table in this codebase is `villas` — `residual_inventory_units.unit_id`
 * is a `villas.id` FK.
 *
 * `residual_unit_ownership_shares` is enforced sum-to-100% per unit by a
 * DEFERRABLE-INITIALLY-DEFERRED trigger.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  boolean,
  bigint,
  jsonb,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { villas } from "./projects";
import { projects } from "./projects";
import { investors } from "./investor-capital";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const residualInventoryUnits = pgTable(
  "residual_inventory_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),

    unitId: uuid("unit_id")
      .notNull()
      .unique()
      .references(() => villas.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),

    /**
     * 'unsold' | 'held' | 'transferred_to_management' | 'sold_later' | 'reallocated'
     */
    status: text("status").notNull().default("unsold"),

    becameResidualAt: date("became_residual_at").notNull(),
    activationReason: text("activation_reason"),

    listPriceMinor: bigint("list_price_minor", { mode: "bigint" }),
    currentMarketValueMinor: bigint("current_market_value_minor", {
      mode: "bigint",
    }),
    conservativeLiquidationValueMinor: bigint(
      "conservative_liquidation_value_minor",
      { mode: "bigint" },
    ),
    internalMinimumSalePriceMinor: bigint(
      "internal_minimum_sale_price_minor",
      { mode: "bigint" },
    ),
    rentalIncomeValuationMinor: bigint("rental_income_valuation_minor", {
      mode: "bigint",
    }),
    manualValuationMinor: bigint("manual_valuation_minor", { mode: "bigint" }),

    /**
     * 'list_price' | 'current_market_value' | 'conservative_liquidation_value'
     * | 'internal_minimum_sale_price' | 'rental_income_valuation' | 'manual_valuation'
     */
    activeValuationMethod: text("active_valuation_method")
      .notNull()
      .default("current_market_value"),
    activeValuationMinor: bigint("active_valuation_minor", {
      mode: "bigint",
    }).notNull(),
    activeValuationDate: date("active_valuation_date").notNull(),
    activeValuationSource: text("active_valuation_source"),

    currency: text("currency").notNull().default("USD"),

    transferredToManagementAt: timestamp("transferred_to_management_at", {
      withTimezone: true,
    }),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    soldPriceMinor: bigint("sold_price_minor", { mode: "bigint" }),

    notes: text("notes"),
    /** Internal-only — never exposed via investor or buyer portals. */
    internalNotes: text("internal_notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("residual_inventory_units_project_idx").on(t.projectId),
    statusIdx: index("residual_inventory_units_status_idx").on(t.status),
    orgIdx: index("residual_inventory_units_org_idx").on(t.organizationId),
  }),
);

export const residualUnitOwnershipShares = pgTable(
  "residual_unit_ownership_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),

    residualUnitId: uuid("residual_unit_id")
      .notNull()
      .references(() => residualInventoryUnits.id, { onDelete: "cascade" }),

    arconiqueShare: boolean("arconique_share").notNull().default(false),
    investorId: uuid("investor_id").references(() => investors.id),

    ownershipPercentage: numeric("ownership_percentage", {
      precision: 7,
      scale: 4,
    }).notNull(),
    economicClaimMinor: bigint("economic_claim_minor", {
      mode: "bigint",
    }).notNull(),

    /**
     * 'by_unrecovered_capital' | 'by_economic_waterfall'
     * | 'by_arconique_25_credit' | 'manual_override'
     */
    settlementMethod: text("settlement_method").notNull(),
    /** Snapshot of input values used at allocation time (for audit). */
    settlementBasis: jsonb("settlement_basis"),

    isApproved: boolean("is_approved").notNull().default(false),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => appUsers.id),
    approvalReason: text("approval_reason"),

    effectiveDate: date("effective_date").notNull(),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    unitIdx: index("residual_unit_ownership_shares_unit_idx").on(
      t.residualUnitId,
    ),
    investorIdx: index("residual_unit_ownership_shares_investor_idx").on(
      t.investorId,
    ),
    orgIdx: index("residual_unit_ownership_shares_org_idx").on(
      t.organizationId,
    ),
  }),
);

export type ResidualInventoryUnit = typeof residualInventoryUnits.$inferSelect;
export type NewResidualInventoryUnit = typeof residualInventoryUnits.$inferInsert;
export type ResidualUnitOwnershipShare =
  typeof residualUnitOwnershipShares.$inferSelect;
export type NewResidualUnitOwnershipShare =
  typeof residualUnitOwnershipShares.$inferInsert;
