import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ownerStayRequests } from "./owner-stays";
import { owners } from "./ownership";
import { projects, villas } from "./projects";
import { appUsers } from "./identity";
import { organizations } from "./saas";
import {
  expenseLines,
  managementFeeLines,
  revenueLines,
  statementPeriods,
} from "./finance";

/**
 * V9C — owner stay → finance bridge audit row. One row per owner-stay
 * request that we've considered for the bridge. The unique index on
 * `owner_stay_request_id` is the idempotency anchor — a retry updates
 * the existing row, never inserts a duplicate.
 *
 * `bridge_status` reflects the outcome:
 *   pending                — created up-front, not yet evaluated
 *   bridged                — finance rows materialised
 *   skipped_no_charge      — request had no chargeable amount
 *   skipped_locked_period  — target statement period is closed/locked
 *   failed                 — DB error / unexpected state, retryable
 *   reversed               — finance rows were rolled back by an admin
 */
export const ownerStayFinanceLinks = pgTable(
  "owner_stay_finance_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerStayRequestId: uuid("owner_stay_request_id")
      .notNull()
      .references(() => ownerStayRequests.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /** TENANCY (migration 0152): nullable org anchor, backfilled via
     *  villa → project.organization_id. Not threaded into queries yet; kept
     *  NULLABLE until app-layer scoping lands. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    statementPeriodId: uuid("statement_period_id").references(
      () => statementPeriods.id,
      { onDelete: "set null" },
    ),
    compensationRevenueLineId: uuid("compensation_revenue_line_id").references(
      () => revenueLines.id,
      { onDelete: "set null" },
    ),
    operationalExpenseLineId: uuid("operational_expense_line_id").references(
      () => expenseLines.id,
      { onDelete: "set null" },
    ),
    managementFeeLineId: uuid("management_fee_line_id").references(
      () => managementFeeLines.id,
      { onDelete: "set null" },
    ),
    bridgeStatus: text("bridge_status").notNull().default("pending"),
    amountMinor: bigint("amount_minor", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency").notNull().default("USD"),
    reason: text("reason"),
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
    uniqueIndex("owner_stay_finance_links_request_unique").on(
      t.ownerStayRequestId,
    ),
    index("owner_stay_finance_links_owner_idx").on(t.ownerId),
    index("owner_stay_finance_links_status_idx").on(t.bridgeStatus),
    index("owner_stay_finance_links_period_idx").on(t.statementPeriodId),
    index("owner_stay_finance_links_organization_idx").on(t.organizationId),
  ],
);

export type OwnerStayFinanceLink = typeof ownerStayFinanceLinks.$inferSelect;
export type NewOwnerStayFinanceLink =
  typeof ownerStayFinanceLinks.$inferInsert;
