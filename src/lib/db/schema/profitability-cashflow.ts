/**
 * Stage 5.B.3 + 5.B.4 — Unit Profitability + Cashflow Forecasting.
 *
 * unit_cost_allocations:
 *   - total_cost_basis_minor + expected_margin_minor are GENERATED STORED
 *   - partial unique index on (asset_id) WHERE is_current = true
 *
 * cashflow_forecasts:
 *   - JSONB monthly_projections snapshot
 *   - scope = 'project' XOR 'company_wide' (CHECK constraint)
 */

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
} from "drizzle-orm/pg-core";
import { villas, projects } from "./projects";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const unitCostAllocations = pgTable(
  "unit_cost_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via projects.organization_id (project_id is NOT NULL).
    // Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    /** References the multi-asset table (villas). */
    assetId: uuid("asset_id")
      .notNull()
      .references(() => villas.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    computedForDate: date("computed_for_date").notNull(),
    landCostAllocatedMinor: bigint("land_cost_allocated_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    landAllocationMethod: text("land_allocation_method"),
    hardCostDirectMinor: bigint("hard_cost_direct_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    hardCostAllocatedMinor: bigint("hard_cost_allocated_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    softCostAllocatedMinor: bigint("soft_cost_allocated_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    softCostMethod: text("soft_cost_method"),
    marketingCostAllocatedMinor: bigint("marketing_cost_allocated_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    marketingAllocationMethod: text("marketing_allocation_method"),
    financingCostAllocatedMinor: bigint("financing_cost_allocated_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    contingencyUsedMinor: bigint("contingency_used_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    /** GENERATED STORED in DB. */
    totalCostBasisMinor: bigint("total_cost_basis_minor", { mode: "bigint" }),
    expectedSalePriceMinor: bigint("expected_sale_price_minor", {
      mode: "bigint",
    }),
    actualSalePriceMinor: bigint("actual_sale_price_minor", { mode: "bigint" }),
    expectedRentalRevenueAnnualMinor: bigint(
      "expected_rental_revenue_annual_minor",
      { mode: "bigint" },
    ),
    /** GENERATED STORED in DB = COALESCE(actual, expected, 0) - total_cost_basis. */
    expectedMarginMinor: bigint("expected_margin_minor", { mode: "bigint" }),
    marginPercentage: numeric("margin_percentage", { precision: 7, scale: 4 }),
    currency: text("currency").notNull().default("IDR"),
    computedBy: uuid("computed_by").references(() => appUsers.id),
    computationMethod: text("computation_method"),
    isCurrent: boolean("is_current").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    assetIdx: index("unit_cost_allocations_asset_idx").on(t.assetId),
    projectIdx: index("unit_cost_allocations_project_idx").on(t.projectId),
    orgIdx: index("unit_cost_allocations_org_idx").on(t.organizationId),
  }),
);

export const cashflowForecasts = pgTable(
  "cashflow_forecasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via projects.organization_id; company_wide forecasts
    // (null project_id) fall back to ARCONIQUE_DEFAULT. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    forecastLabel: text("forecast_label").notNull(),
    /** 'project' | 'company_wide' */
    scope: text("scope").notNull(),
    projectId: uuid("project_id").references(() => projects.id),
    forecastHorizonMonths: integer("forecast_horizon_months").notNull(),
    forecastStartMonth: date("forecast_start_month").notNull(),
    /**
     * [{month, inflow, outflow, net, cumulativeCash}] — JSONB snapshot.
     * Caller does not mutate after save; new forecasts write a new row.
     */
    monthlyProjections: jsonb("monthly_projections").notNull(),
    peakCapitalRequiredMinor: bigint("peak_capital_required_minor", {
      mode: "bigint",
    }),
    peakRequiredAtMonth: date("peak_required_at_month"),
    totalInflowMinor: bigint("total_inflow_minor", { mode: "bigint" }),
    totalOutflowMinor: bigint("total_outflow_minor", { mode: "bigint" }),
    endingCashMinor: bigint("ending_cash_minor", { mode: "bigint" }),
    /** [{month, gapAmount, severity}] */
    identifiedCashGaps: jsonb("identified_cash_gaps"),
    /** 'draft' | 'active' | 'archived' | 'superseded' */
    status: text("status").notNull().default("draft"),
    generatedByAgent: boolean("generated_by_agent").notNull().default(false),
    approvedBy: uuid("approved_by").references(() => appUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    scopeIdx: index("cashflow_forecasts_scope_idx").on(t.scope),
    projectIdx: index("cashflow_forecasts_project_idx").on(t.projectId),
    statusIdx: index("cashflow_forecasts_status_idx").on(t.status),
    startIdx: index("cashflow_forecasts_start_idx").on(t.forecastStartMonth),
    orgIdx: index("cashflow_forecasts_org_idx").on(t.organizationId),
  }),
);

export type UnitCostAllocation = typeof unitCostAllocations.$inferSelect;
export type NewUnitCostAllocation = typeof unitCostAllocations.$inferInsert;
export type CashflowForecast = typeof cashflowForecasts.$inferSelect;
export type NewCashflowForecast = typeof cashflowForecasts.$inferInsert;
