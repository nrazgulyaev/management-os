/**
 * Stage 5.C — Executive Command Center.
 *
 * Three synthesis tables (no new business logic):
 *   - executive_metrics_snapshots  pre-computed dashboard aggregations
 *   - risk_radar_alerts            AI/rule-based risk alerts
 *   - executive_digests            monthly executive summary
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
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const executiveMetricsSnapshots = pgTable(
  "executive_metrics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),

    snapshotDate: date("snapshot_date").notNull().defaultNow(),
    snapshotType: text("snapshot_type").notNull(),
    scope: text("scope").notNull(),
    projectId: uuid("project_id").references(() => projects.id),

    totalCashOnHandMinor: bigint("total_cash_on_hand_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    cashByAccount: jsonb("cash_by_account"),
    cashInIdrEquivalentMinor: bigint("cash_in_idr_equivalent_minor", {
      mode: "bigint",
    }),

    totalReceivablesMinor: bigint("total_receivables_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    receivablesAging: jsonb("receivables_aging"),

    totalPayablesMinor: bigint("total_payables_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    payablesDueNext30DaysMinor: bigint("payables_due_next_30_days_minor", {
      mode: "bigint",
    }),
    payablesOverdueMinor: bigint("payables_overdue_minor", { mode: "bigint" }),

    taxPayableMinor: bigint("tax_payable_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    unclassifiedTransactionsCount: integer("unclassified_transactions_count")
      .notNull()
      .default(0),

    activeProjectsCount: integer("active_projects_count").notNull().default(0),
    projectsOnTrack: integer("projects_on_track").notNull().default(0),
    projectsAtRisk: integer("projects_at_risk").notNull().default(0),
    projectsDelayed: integer("projects_delayed").notNull().default(0),

    activeLeadsCount: integer("active_leads_count").notNull().default(0),
    hotLeadsCount: integer("hot_leads_count").notNull().default(0),
    reservationsCount: integer("reservations_count").notNull().default(0),
    contractsSignedThisMonth: integer("contracts_signed_this_month")
      .notNull()
      .default(0),
    totalPipelineValueMinor: bigint("total_pipeline_value_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),

    totalCommittedCapitalMinor: bigint("total_committed_capital_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    totalDrawnCapitalMinor: bigint("total_drawn_capital_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    pendingDistributionMinor: bigint("pending_distribution_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    pendingInvestorRequestsCount: integer("pending_investor_requests_count")
      .notNull()
      .default(0),

    openQaQcIssues: integer("open_qa_qc_issues").notNull().default(0),
    criticalQaQcIssues: integer("critical_qa_qc_issues").notNull().default(0),
    pendingChangeOrders: integer("pending_change_orders").notNull().default(0),
    highRiskItemsCount: integer("high_risk_items_count").notNull().default(0),
    lowStockItemsCount: integer("low_stock_items_count").notNull().default(0),

    totalCommittedBudgetMinor: bigint("total_committed_budget_minor", {
      mode: "bigint",
    }),
    totalActualSpendMinor: bigint("total_actual_spend_minor", {
      mode: "bigint",
    }),
    budgetBurnPercentage: numeric("budget_burn_percentage", {
      precision: 5,
      scale: 2,
    }),
    blendedMarginPercentage: numeric("blended_margin_percentage", {
      precision: 7,
      scale: 4,
    }),

    payrollRunwayWeeks: numeric("payroll_runway_weeks", {
      precision: 5,
      scale: 2,
    }),
    cashAt30DaysMinor: bigint("cash_at_30_days_minor", { mode: "bigint" }),
    cashAt60DaysMinor: bigint("cash_at_60_days_minor", { mode: "bigint" }),
    cashAt90DaysMinor: bigint("cash_at_90_days_minor", { mode: "bigint" }),
    identifiedCashGapsCount: integer("identified_cash_gaps_count")
      .notNull()
      .default(0),

    baseCurrency: text("base_currency").notNull().default("IDR"),
    fxSnapshot: jsonb("fx_snapshot"),

    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    computationDurationMs: integer("computation_duration_ms"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("executive_metrics_snapshots_date_idx").on(t.snapshotDate),
    index("executive_metrics_snapshots_type_idx").on(t.snapshotType),
    index("executive_metrics_snapshots_scope_idx").on(t.scope),
    index("executive_metrics_snapshots_project_idx").on(t.projectId),
  ],
);

export const riskRadarAlerts = pgTable(
  "risk_radar_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    alertCode: text("alert_code").notNull().unique(),

    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    detectionSource: text("detection_source").notNull(),
    detectionMethod: text("detection_method"),

    alertCategory: text("alert_category").notNull(),
    severity: text("severity").notNull(),

    title: text("title").notNull(),
    description: text("description").notNull(),

    detectedPattern: text("detected_pattern"),
    affectedEntities: jsonb("affected_entities"),
    supportingData: jsonb("supporting_data"),

    aiReasoning: text("ai_reasoning"),
    confidenceLevel: text("confidence_level"),

    recommendedAction: text("recommended_action"),

    status: text("status").notNull().default("open"),

    acknowledgedBy: uuid("acknowledged_by").references(() => appUsers.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => appUsers.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNotes: text("resolution_notes"),

    similarAlertsCount: integer("similar_alerts_count").notNull().default(0),
    isRecurring: boolean("is_recurring").notNull().default(false),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("risk_radar_alerts_category_idx").on(t.alertCategory),
    index("risk_radar_alerts_severity_idx").on(t.severity),
    index("risk_radar_alerts_status_idx").on(t.status),
    index("risk_radar_alerts_detected_idx").on(t.detectedAt),
  ],
);

export const executiveDigests = pgTable(
  "executive_digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    digestCode: text("digest_code").notNull().unique(),

    periodLabel: text("period_label").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    digestType: text("digest_type").notNull(),

    executiveSummary: text("executive_summary").notNull(),

    cashPositionSection: text("cash_position_section"),
    projectProgressSection: text("project_progress_section"),
    salesSection: text("sales_section"),
    investorSection: text("investor_section"),
    operationsSection: text("operations_section"),
    risksSection: text("risks_section"),

    keyWins: text("key_wins")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    keyConcerns: text("key_concerns")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    recommendedActions: text("recommended_actions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    metricsSnapshotId: uuid("metrics_snapshot_id").references(
      () => executiveMetricsSnapshots.id,
    ),

    aiGenerated: boolean("ai_generated").notNull().default(false),
    aiProvider: text("ai_provider"),
    aiModel: text("ai_model"),
    aiGenerationMetadata: jsonb("ai_generation_metadata"),

    status: text("status").notNull().default("draft"),

    approvedBy: uuid("approved_by").references(() => appUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    distributedTo: jsonb("distributed_to"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("executive_digests_period_idx").on(t.periodStart, t.periodEnd),
    index("executive_digests_type_idx").on(t.digestType),
    index("executive_digests_status_idx").on(t.status),
  ],
);

export type ExecutiveMetricsSnapshot = typeof executiveMetricsSnapshots.$inferSelect;
export type NewExecutiveMetricsSnapshot = typeof executiveMetricsSnapshots.$inferInsert;
export type RiskRadarAlert = typeof riskRadarAlerts.$inferSelect;
export type NewRiskRadarAlert = typeof riskRadarAlerts.$inferInsert;
export type ExecutiveDigest = typeof executiveDigests.$inferSelect;
export type NewExecutiveDigest = typeof executiveDigests.$inferInsert;
