/**
 * Stage 5.B.2 — Project Cycle Intelligence.
 *
 * payroll_periods + team_capacity_tracking (with GENERATED STORED
 * utilization_rate + idle_hours) + project_cycle_recommendations
 * (AI advisory output, operator review required — no auto-action).
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
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";

export const payrollPeriods = pgTable(
  "payroll_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodLabel: text("period_label").notNull().unique(),
    /** 'weekly' | 'biweekly' | 'monthly' | 'quarterly' */
    periodType: text("period_type").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    totalPayrollAmountMinor: bigint("total_payroll_amount_minor", {
      mode: "bigint",
    }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    totalHeadcount: integer("total_headcount").notNull(),
    /** [{project_id, allocation_percentage, amount_minor}] */
    allocations: jsonb("allocations"),
    /** 'projected' | 'committed' | 'paid' | 'archived' */
    status: text("status").notNull().default("projected"),
    relatedTransactions: uuid("related_transactions")
      .array()
      .notNull()
      .default(sql`'{}'`),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    periodIdx: index("payroll_periods_period_idx").on(t.periodStart, t.periodEnd),
    statusIdx: index("payroll_periods_status_idx").on(t.status),
  }),
);

export const teamCapacityTracking = pgTable(
  "team_capacity_tracking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackingPeriodStart: date("tracking_period_start").notNull(),
    trackingPeriodEnd: date("tracking_period_end").notNull(),
    /**
     * 'pm' | 'qs' | 'site_supervisor' | 'engineer' | 'architect'
     * | 'designer' | 'admin' | 'sales' | 'finance' | 'other'
     */
    roleType: text("role_type").notNull(),
    totalTeamMembers: integer("total_team_members").notNull(),
    totalCapacityHours: numeric("total_capacity_hours", {
      precision: 10,
      scale: 2,
    }).notNull(),
    /** [{project_id, hours, percentage}] */
    allocations: jsonb("allocations").notNull(),
    utilizedHours: numeric("utilized_hours", {
      precision: 10,
      scale: 2,
    }).notNull(),
    /** GENERATED STORED in DB. */
    utilizationRate: numeric("utilization_rate", { precision: 7, scale: 2 }),
    /** GENERATED STORED in DB = max(total - utilized, 0). */
    idleHours: numeric("idle_hours", { precision: 10, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    periodIdx: index("team_capacity_tracking_period_idx").on(
      t.trackingPeriodStart,
      t.trackingPeriodEnd,
    ),
    roleIdx: index("team_capacity_tracking_role_idx").on(t.roleType),
  }),
);

export const projectCycleRecommendations = pgTable(
  "project_cycle_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recommendationCode: text("recommendation_code").notNull().unique(),
    generatedForDate: date("generated_for_date").notNull(),
    generatedByAgent: text("generated_by_agent")
      .notNull()
      .default("project_cycle_intelligence"),
    contextSnapshot: jsonb("context_snapshot").notNull(),
    /**
     * 'start_new_project_now' | 'start_new_project_in_X_weeks'
     * | 'pause_team_capacity' | 'reduce_team_size' | 'increase_team_size'
     * | 'continue_current_pace' | 'reallocate_capacity'
     */
    recommendedAction: text("recommended_action").notNull(),
    recommendedTiming: text("recommended_timing"),
    aiReasoning: text("ai_reasoning").notNull(),
    supportingMetrics: jsonb("supporting_metrics"),
    /** 'low' | 'medium' | 'high' */
    confidenceLevel: text("confidence_level"),
    /**
     * 'unreviewed' | 'reviewed' | 'accepted' | 'rejected' | 'partially_accepted'
     */
    operatorStatus: text("operator_status").notNull().default("unreviewed"),
    operatorNotes: text("operator_notes"),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    outcomeObserved: text("outcome_observed"),
    outcomeObservedAt: timestamp("outcome_observed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dateIdx: index("project_cycle_recommendations_date_idx").on(
      t.generatedForDate,
    ),
    statusIdx: index("project_cycle_recommendations_status_idx").on(
      t.operatorStatus,
    ),
  }),
);

export type PayrollPeriod = typeof payrollPeriods.$inferSelect;
export type NewPayrollPeriod = typeof payrollPeriods.$inferInsert;
export type TeamCapacityTracking = typeof teamCapacityTracking.$inferSelect;
export type NewTeamCapacityTracking = typeof teamCapacityTracking.$inferInsert;
export type ProjectCycleRecommendation =
  typeof projectCycleRecommendations.$inferSelect;
export type NewProjectCycleRecommendation =
  typeof projectCycleRecommendations.$inferInsert;
