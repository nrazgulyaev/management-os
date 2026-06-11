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

/**
 * PTKP status (marital + dependents at start of year) — drives the PPh21 TER
 * category. Migration 0172. K/1 is TER Category B (NOT A) — a common error.
 */
export const PTKP_STATUSES = [
  "TK/0",
  "TK/1",
  "TK/2",
  "TK/3",
  "K/0",
  "K/1",
  "K/2",
  "K/3",
] as const;
export type PtkpStatus = (typeof PTKP_STATUSES)[number];

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
    /**
     * Effective-dating (migration 0172). hired_on / ended_on bound the active
     * window for mid-month PRORATION; both NULL = always active (legacy
     * behaviour). rate_effective_from is an informational marker for when the
     * current rate took effect (NOT used in the proration math).
     */
    hiredOn: date("hired_on"),
    endedOn: date("ended_on"),
    rateEffectiveFrom: date("rate_effective_from"),
    /**
     * Indonesian statutory opt-in (migration 0172). statutory_enabled gates
     * BPJS/PPh21 for THIS staff member (only honoured when the org has statutory
     * enabled too, and only for salaried). ptkp_status drives the PPh21 TER
     * category. no_npwp adds the +20% PPh21 surcharge. OFF by default — existing
     * payroll behaviour is unchanged unless explicitly enabled.
     */
    statutoryEnabled: boolean("statutory_enabled").notNull().default(false),
    ptkpStatus: text("ptkp_status"),
    noNpwp: boolean("no_npwp").notNull().default(false),
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

/**
 * org_payroll_settings — editable BPJS / PPh21 defaults per org (migration
 * 0172). One row per org (UNIQUE organization_id). Stores the org's OVERRIDES +
 * the master statutory switch; app code seeds the researched 2026 defaults on
 * first read. Rates are numeric percentages (3.7 = 3.7%); caps are bigint minor
 * units. Org-scoped (#199/#200): every read/write ANDs organization_id.
 */
export const orgPayrollSettings = pgTable(
  "org_payroll_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "restrict" }),
    /** Master switch — nothing is computed unless the org turns statutory on. */
    statutoryEnabled: boolean("statutory_enabled").notNull().default(false),

    // BPJS Ketenagakerjaan — JHT (old-age): no cap.
    jhtEmployerPct: numeric("jht_employer_pct", { precision: 6, scale: 4 }).notNull().default("3.7"),
    jhtEmployeePct: numeric("jht_employee_pct", { precision: 6, scale: 4 }).notNull().default("2"),
    // JKK (work-accident): employer-only, risk-tier selectable (0.24..1.74).
    jkkEmployerPct: numeric("jkk_employer_pct", { precision: 6, scale: 4 }).notNull().default("0.24"),
    // JKM (death): employer-only.
    jkmEmployerPct: numeric("jkm_employer_pct", { precision: 6, scale: 4 }).notNull().default("0.3"),
    // JP (pension): capped wage base (Rp11,086,300 eff. March 2026).
    jpEmployerPct: numeric("jp_employer_pct", { precision: 6, scale: 4 }).notNull().default("2"),
    jpEmployeePct: numeric("jp_employee_pct", { precision: 6, scale: 4 }).notNull().default("1"),
    jpCapMinor: bigint("jp_cap_minor", { mode: "bigint" }).notNull().default(1108630000n),
    // BPJS Kesehatan (health): capped wage base (Rp12,000,000).
    kesehatanEmployerPct: numeric("kesehatan_employer_pct", { precision: 6, scale: 4 }).notNull().default("4"),
    kesehatanEmployeePct: numeric("kesehatan_employee_pct", { precision: 6, scale: 4 }).notNull().default("1"),
    kesehatanCapMinor: bigint("kesehatan_cap_minor", { mode: "bigint" }).notNull().default(1200000000n),

    // PPh21 (TER monthly method).
    pph21Enabled: boolean("pph21_enabled").notNull().default(true),
    noNpwpSurchargePct: numeric("no_npwp_surcharge_pct", { precision: 6, scale: 4 }).notNull().default("20"),

    currency: text("currency").notNull().default("IDR"),
    updatedBy: uuid("updated_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("org_payroll_settings_org_idx").on(t.organizationId)],
);

/**
 * payroll_payslips — per-run, per-staff statutory breakdown (migration 0172).
 * ONE row per (run, staff) when statutory is computed — the payslip view source.
 * The single expense_line carries the TOTAL employer cost (gross + employer
 * BPJS); this table records the SPLIT for transparency. Employee deductions +
 * PPh21 are withheld from gross, NOT extra expense lines. Org-scoped.
 */
export const payrollPayslips = pgTable(
  "payroll_payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    currency: text("currency").notNull().default("IDR"),

    /** Prorated gross actually used for this run. */
    grossMinor: bigint("gross_minor", { mode: "bigint" }).notNull().default(0n),
    prorationNumerator: integer("proration_numerator").notNull().default(0),
    prorationDenominator: integer("proration_denominator").notNull().default(0),

    // Employer-side BPJS, by component.
    employerJhtMinor: bigint("employer_jht_minor", { mode: "bigint" }).notNull().default(0n),
    employerJkkMinor: bigint("employer_jkk_minor", { mode: "bigint" }).notNull().default(0n),
    employerJkmMinor: bigint("employer_jkm_minor", { mode: "bigint" }).notNull().default(0n),
    employerJpMinor: bigint("employer_jp_minor", { mode: "bigint" }).notNull().default(0n),
    employerKesehatanMinor: bigint("employer_kesehatan_minor", { mode: "bigint" }).notNull().default(0n),
    employerContribMinor: bigint("employer_contrib_minor", { mode: "bigint" }).notNull().default(0n),

    // Employee-side withholdings (deducted from gross, remitted — NOT employer cost).
    employeeJhtMinor: bigint("employee_jht_minor", { mode: "bigint" }).notNull().default(0n),
    employeeJpMinor: bigint("employee_jp_minor", { mode: "bigint" }).notNull().default(0n),
    employeeKesehatanMinor: bigint("employee_kesehatan_minor", { mode: "bigint" }).notNull().default(0n),
    employeeBpjsMinor: bigint("employee_bpjs_minor", { mode: "bigint" }).notNull().default(0n),
    pph21Minor: bigint("pph21_minor", { mode: "bigint" }).notNull().default(0n),
    terCategory: text("ter_category"),

    // Derived totals.
    netTakeHomeMinor: bigint("net_take_home_minor", { mode: "bigint" }).notNull().default(0n),
    totalEmployerCostMinor: bigint("total_employer_cost_minor", { mode: "bigint" }).notNull().default(0n),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payroll_payslips_org_idx").on(t.organizationId),
    index("payroll_payslips_run_idx").on(t.payrollRunId),
    index("payroll_payslips_staff_idx").on(t.staffId),
    uniqueIndex("payroll_payslips_run_staff_unique").on(t.payrollRunId, t.staffId),
  ],
);

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type NewPayrollRun = typeof payrollRuns.$inferInsert;
export type StaffAssignment = typeof staffAssignments.$inferSelect;
export type NewStaffAssignment = typeof staffAssignments.$inferInsert;
export type OrgPayrollSettings = typeof orgPayrollSettings.$inferSelect;
export type NewOrgPayrollSettings = typeof orgPayrollSettings.$inferInsert;
export type PayrollPayslip = typeof payrollPayslips.$inferSelect;
export type NewPayrollPayslip = typeof payrollPayslips.$inferInsert;
