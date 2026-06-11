import {
  pgTable,
  uuid,
  text,
  bigint,
  integer,
  boolean,
  date,
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
    /** Monthly rate in minor units of `currency`. */
    monthlyRateMinor: bigint("monthly_rate_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    /** villa | project_pool | company — where the generated cost lands. */
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

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type NewPayrollRun = typeof payrollRuns.$inferInsert;
