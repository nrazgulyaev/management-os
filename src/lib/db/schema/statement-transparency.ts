import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  bigint,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects, villas } from "./projects";
import { owners } from "./ownership";
import { ownerStatements, statementLines } from "./finance";
import { organizations } from "./saas";

/**
 * Prompt 110 — Finance & Statement Transparency Final Polish.
 *
 * Four owner-safe projection tables that explain owner statements
 * without mutating accounting rows.  Owners only ever read these
 * projections — the redaction contract is enforced once, in
 * `src/features/statement-transparency/grouping-pure.ts` /
 * `explanation-pure.ts` / `reconciliation-pure.ts`.
 */

export const statementSourceGroups = pgTable(
  "statement_source_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via owner_statements.organization_id. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    ownerStatementId: uuid("owner_statement_id")
      .notNull()
      .references(() => ownerStatements.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    groupKey: text("group_key").notNull(),
    groupLabel: text("group_label").notNull(),
    groupDescription: text("group_description"),
    grossAmountMinor: bigint("gross_amount_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    deductionAmountMinor: bigint("deduction_amount_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    netAmountMinor: bigint("net_amount_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    currency: text("currency").notNull(),
    lineCount: integer("line_count").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    ownerVisible: boolean("owner_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("statement_source_groups_statement_idx").on(
      t.ownerStatementId,
      t.sortOrder,
    ),
    index("statement_source_groups_owner_idx").on(t.ownerId),
    index("statement_source_groups_villa_idx").on(t.villaId),
    index("statement_source_groups_project_idx").on(t.projectId),
    index("statement_source_groups_key_idx").on(t.groupKey),
    uniqueIndex("statement_source_groups_unique").on(
      t.ownerStatementId,
      t.groupKey,
      t.currency,
    ),
    index("statement_source_groups_org_idx").on(t.organizationId),
  ],
);

export const statementSourceGroupLines = pgTable(
  "statement_source_group_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via owner_statements.organization_id. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    statementSourceGroupId: uuid("statement_source_group_id")
      .notNull()
      .references(() => statementSourceGroups.id, { onDelete: "cascade" }),
    ownerStatementId: uuid("owner_statement_id")
      .notNull()
      .references(() => ownerStatements.id, { onDelete: "cascade" }),
    statementLineId: uuid("statement_line_id")
      .notNull()
      .references(() => statementLines.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    groupKey: text("group_key").notNull(),
    ownerVisibleLabel: text("owner_visible_label").notNull(),
    internalSourceTable: text("internal_source_table"),
    internalSourceId: uuid("internal_source_id"),
    sourceTraceStatus: text("source_trace_status").notNull().default("linked"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("statement_source_group_lines_group_idx").on(
      t.statementSourceGroupId,
    ),
    index("statement_source_group_lines_statement_idx").on(t.ownerStatementId),
    index("statement_source_group_lines_line_idx").on(t.statementLineId),
    index("statement_source_group_lines_owner_idx").on(t.ownerId),
    index("statement_source_group_lines_key_idx").on(t.groupKey),
    index("statement_source_group_lines_trace_status_idx").on(
      t.sourceTraceStatus,
    ),
    uniqueIndex("statement_source_group_lines_unique").on(
      t.ownerStatementId,
      t.statementLineId,
    ),
    index("statement_source_group_lines_org_idx").on(t.organizationId),
  ],
);

export const statementReconciliationWarnings = pgTable(
  "statement_reconciliation_warnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via owner_statements.organization_id; rows with a null
    // statement (system-wide warnings) fall back to ARCONIQUE_DEFAULT.
    // Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    ownerStatementId: uuid("owner_statement_id").references(
      () => ownerStatements.id,
      { onDelete: "cascade" },
    ),
    ownerId: uuid("owner_id").references(() => owners.id, {
      onDelete: "cascade",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    warningType: text("warning_type").notNull(),
    severity: text("severity").notNull().default("info"),
    ownerVisible: boolean("owner_visible").notNull().default(false),
    ownerTitle: text("owner_title"),
    ownerMessage: text("owner_message"),
    internalTitle: text("internal_title").notNull(),
    internalMessage: text("internal_message").notNull(),
    sourceTable: text("source_table"),
    sourceId: uuid("source_id"),
    status: text("status").notNull().default("open"),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("statement_reconciliation_warnings_statement_idx").on(
      t.ownerStatementId,
    ),
    index("statement_reconciliation_warnings_owner_idx").on(t.ownerId),
    index("statement_reconciliation_warnings_villa_idx").on(t.villaId),
    index("statement_reconciliation_warnings_type_idx").on(t.warningType),
    index("statement_reconciliation_warnings_severity_idx").on(t.severity),
    index("statement_reconciliation_warnings_status_idx").on(t.status),
    index("statement_reconciliation_warnings_open_idx")
      .on(sql`${t.detectedAt} DESC`)
      .where(sql`${t.status} = 'open'`),
    uniqueIndex("statement_reconciliation_warnings_open_unique")
      .on(t.warningType, t.sourceTable, t.sourceId)
      .where(sql`${t.status} = 'open' AND ${t.sourceId} IS NOT NULL`),
    index("statement_reconciliation_warnings_org_idx").on(t.organizationId),
  ],
);

export const statementExplanationSnapshots = pgTable(
  "statement_explanation_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via owner_statements.organization_id. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    ownerStatementId: uuid("owner_statement_id")
      .notNull()
      .references(() => ownerStatements.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    headline: text("headline").notNull(),
    summary: text("summary").notNull(),
    bulletPoints: jsonb("bullet_points").notNull().default(sql`'[]'::jsonb`),
    payoutExplanation: text("payout_explanation"),
    revenueExplanation: text("revenue_explanation"),
    deductionExplanation: text("deduction_explanation"),
    reserveExplanation: text("reserve_explanation"),
    warningExplanation: text("warning_explanation"),
    currency: text("currency").notNull(),
    totalRevenueMinor: bigint("total_revenue_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    totalDeductionsMinor: bigint("total_deductions_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    netPayoutMinor: bigint("net_payout_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("statement_explanation_snapshots_statement_idx").on(
      t.ownerStatementId,
    ),
    index("statement_explanation_snapshots_owner_idx").on(t.ownerId),
    index("statement_explanation_snapshots_generated_idx").on(
      sql`${t.generatedAt} DESC`,
    ),
    uniqueIndex("statement_explanation_snapshots_unique").on(
      t.ownerStatementId,
    ),
    index("statement_explanation_snapshots_org_idx").on(t.organizationId),
  ],
);

export type StatementSourceGroup = typeof statementSourceGroups.$inferSelect;
export type NewStatementSourceGroup =
  typeof statementSourceGroups.$inferInsert;
export type StatementSourceGroupLine =
  typeof statementSourceGroupLines.$inferSelect;
export type NewStatementSourceGroupLine =
  typeof statementSourceGroupLines.$inferInsert;
export type StatementReconciliationWarning =
  typeof statementReconciliationWarnings.$inferSelect;
export type NewStatementReconciliationWarning =
  typeof statementReconciliationWarnings.$inferInsert;
export type StatementExplanationSnapshot =
  typeof statementExplanationSnapshots.$inferSelect;
export type NewStatementExplanationSnapshot =
  typeof statementExplanationSnapshots.$inferInsert;
