import {
  pgTable,
  uuid,
  text,
  bigint,
  integer,
  boolean,
  date,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";

/**
 * Payroll / staff-cost domain — migration 0170.
 *
 * Models recurring staff cost (housekeeper, pool technician, gardener, …) so a
 * rate card flows into project/villa costs + owner statements every month via
 * the EXISTING finance expense pipeline. `staff` is just the rate card;
 * `payroll_runs` records that a month was posted (UNIQUE per org+month = the
 * idempotency guard). The actual money lands as normal `expense_lines` rows of
 * type `staff_allocation`, which the statement generator already consumes — no
 * parallel money path.
 *
 * Money rule (binding): `monthly_rate_minor` / `total_minor` are BIGINT minor
 * units of `currency`. Floating point is forbidden for amounts at rest.
 */

/** Allocation scopes a staff cost can land in — mirrors expense_lines.allocation_scope. */
export const STAFF_ALLOCATION_SCOPES = ["villa", "project_pool", "company"] as const;
export type StaffAllocationScope = (typeof STAFF_ALLOCATION_SCOPES)[number];

/**
 * Axis 1 — COMPENSATION MODE (how the monthly cost is computed). Migration 0171.
 *   salaried        flat monthly_rate_minor
 *   per_villa_fixed per_villa_rate_minor × sum(active assignment weights);
 *                   the run fans out ONE expense line per active assignment
 *   per_service     ad-hoc — SKIPPED in the monthly run
 * These exact strings are the phase-2 contract.
 */
export const STAFF_COMP_MODES = ["salaried", "per_villa_fixed", "per_service"] as const;
export type StaffCompMode = (typeof STAFF_COMP_MODES)[number];

/**
 * Axis 2 — COST BEARER (who actually pays, independent of the geographic
 * target). Migration 0171. Mirrored on expense_lines.cost_bearer — that is the
 * column phase 2's statement generator + company-P&L report read to route the
 * money:
 *   owner       itemised on the owner statement at cost (reduces net payout)
 *   management  absorbed by the company P&L (never reduces owner payout)
 *   shared_pool apportioned across the complex's owners per villa
 * owner_chargeable = (cost_bearer IN ('owner','shared_pool')).
 */
export const STAFF_COST_BEARERS = ["owner", "management", "shared_pool"] as const;
export type StaffCostBearer = (typeof STAFF_COST_BEARERS)[number];

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    fullName: text("full_name").notNull(),
    /** e.g. 'Housekeeper' | 'Pool technician' | 'Gardener' | 'Security'. */
    roleLabel: text("role_label").notNull(),
    /** Monthly rate in minor units of `currency` — used when comp_mode='salaried'. */
    monthlyRateMinor: bigint("monthly_rate_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    /**
     * Axis 1 — salaried | per_villa_fixed | per_service. Default 'salaried'.
     * See STAFF_COMP_MODES. CHECK enforced at DB level (migration 0171).
     */
    compMode: text("comp_mode").notNull().default("salaried"),
    /**
     * Axis 2 — owner | management | shared_pool. Default 'owner'. Stamped onto
     * every expense line this staff posts (expense_lines.cost_bearer). See
     * STAFF_COST_BEARERS. CHECK enforced at DB level (migration 0171).
     */
    costBearer: text("cost_bearer").notNull().default("owner"),
    /** Per-villa rate in minor units — used when comp_mode='per_villa_fixed'. */
    perVillaRateMinor: bigint("per_villa_rate_minor", { mode: "bigint" }),
    /** villa | project_pool | company — FALLBACK single-target when no assignments. */
    allocationScope: text("allocation_scope").notNull().default("company"),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("staff_org_idx").on(t.organizationId),
    index("staff_org_active_idx").on(t.organizationId, t.active),
    index("staff_villa_idx").on(t.villaId),
    index("staff_project_idx").on(t.projectId),
  ],
);

export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    /** First day of the payroll month (YYYY-MM-01). */
    periodMonth: date("period_month").notNull(),
    label: text("label").notNull(),
    currency: text("currency").notNull().default("IDR"),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull().default(0n),
    staffCount: integer("staff_count").notNull().default(0),
    expenseCount: integer("expense_count").notNull().default(0),
    status: text("status").notNull().default("posted"),
    postedBy: uuid("posted_by").references(() => appUsers.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotency guard: one payroll run per org per month.
    uniqueIndex("payroll_runs_org_period_unique").on(t.organizationId, t.periodMonth),
    index("payroll_runs_org_idx").on(t.organizationId),
  ],
);

/**
 * staff_assignments — one staff member → N villas/complexes (migration 0171).
 *
 * Replaces the single villaId/projectId fallback for multi-target staff. For
 * comp_mode='per_villa_fixed' the run fans out ONE expense line per active
 * assignment, attributed to that assignment's villa (or project), at
 * per_villa_rate_minor × weight. Org-scoped (#199/#200 write-flow).
 */
export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    /** Fan-out multiplier for per_villa_fixed cost (default 1). */
    weight: numeric("weight", { precision: 8, scale: 3 }).notNull().default("1"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("staff_assignments_org_idx").on(t.organizationId),
    index("staff_assignments_staff_idx").on(t.staffId),
    index("staff_assignments_staff_active_idx").on(t.staffId, t.active),
    index("staff_assignments_villa_idx").on(t.villaId),
    index("staff_assignments_project_idx").on(t.projectId),
  ],
);

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type NewPayrollRun = typeof payrollRuns.$inferInsert;
export type StaffAssignment = typeof staffAssignments.$inferSelect;
export type NewStaffAssignment = typeof staffAssignments.$inferInsert;
