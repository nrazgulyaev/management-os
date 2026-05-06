/**
 * Stage 4.A.3 — Shared cost allocations.
 *
 * When a transaction spans multiple projects (office rent, payroll,
 * marketing campaign), an allocation header + per-project lines split
 * the cost. DB-level trigger enforces percentages sum to exactly 100%.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  bigint,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { projects } from "./projects";
import { devTransactions } from "./dev-finance";

export const sharedCostAllocations = pgTable(
  "shared_cost_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    sourceTransactionId: uuid("source_transaction_id")
      .notNull()
      .unique()
      .references(() => devTransactions.id, { onDelete: "cascade" }),

    /** See migration CHECK for full enum */
    allocationMethod: text("allocation_method").notNull(),
    /** Snapshot of the values used for the split (areas, headcount, etc.) */
    allocationBasis: jsonb("allocation_basis"),

    /** 'draft' | 'approved' | 'applied' | 'reversed' | 'superseded' */
    status: text("status").notNull().default("draft"),
    approvedBy: uuid("approved_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    notes: text("notes"),
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
    index("shared_cost_allocations_source_idx").on(t.sourceTransactionId),
    index("shared_cost_allocations_status_idx").on(t.status),
  ],
);

export type SharedCostAllocation = typeof sharedCostAllocations.$inferSelect;
export type NewSharedCostAllocation =
  typeof sharedCostAllocations.$inferInsert;

export const sharedCostAllocationLines = pgTable(
  "shared_cost_allocation_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    allocationId: uuid("allocation_id")
      .notNull()
      .references(() => sharedCostAllocations.id, { onDelete: "cascade" }),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    percentage: numeric("percentage", { precision: 7, scale: 4 }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),

    derivativeTransactionId: uuid("derivative_transaction_id").references(
      () => devTransactions.id,
      { onDelete: "set null" },
    ),

    notes: text("notes"),
  },
  (t) => [
    index("shared_cost_allocation_lines_allocation_idx").on(t.allocationId),
    index("shared_cost_allocation_lines_project_idx").on(t.projectId),
  ],
);

export type SharedCostAllocationLine =
  typeof sharedCostAllocationLines.$inferSelect;
export type NewSharedCostAllocationLine =
  typeof sharedCostAllocationLines.$inferInsert;
