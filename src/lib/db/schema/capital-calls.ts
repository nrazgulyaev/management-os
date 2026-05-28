/**
 * Phase 2 data-wiring PR 2 (Dev slice) — capital_calls + capital_call_allocations.
 *
 * `capital_calls` is the call ISSUANCE event (one call per project per
 * date, totalUsd across all investors). `capital_call_allocations` is the
 * per-investor split. Distinct from `capitalDrawdowns` (investor-capital.ts),
 * which is post-call money movement tracked per commitment.
 *
 * The capital-call-drafter agent (event-triggered when project cash drops
 * below 14d runway) drafts these; finance staff approves + issues.
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Dev P1.
 */

import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { appUsers } from "./identity";
import { investors } from "./investor-capital";

export type CapitalCallKind =
  | "initial"
  | "construction_milestone"
  | "overrun"
  | "bridge"
  | "final";

export type CapitalCallStatus = "draft" | "issued" | "partial" | "received" | "cancelled";

export const capitalCalls = pgTable(
  "capital_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Restrict — calls outlive project rename but not deletion.
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    /** e.g. CC-EV02-0004. */
    ref: text("ref").notNull().unique(),
    /** Enum: initial | construction_milestone | overrun | bridge | final. */
    kind: text("kind").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    totalUsd: numeric("total_usd", { precision: 14, scale: 2 }).notNull(),
    /** Enum: draft | issued | partial | received | cancelled. */
    status: text("status").notNull().default("draft"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("capital_calls_project_issued_idx").on(t.projectId, t.issuedAt),
    index("capital_calls_status_due_idx").on(t.status, t.dueAt),
  ],
);

export type CapitalCall = typeof capitalCalls.$inferSelect;
export type NewCapitalCall = typeof capitalCalls.$inferInsert;

export const capitalCallAllocations = pgTable(
  "capital_call_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callId: uuid("call_id")
      .notNull()
      .references(() => capitalCalls.id, { onDelete: "cascade" }),
    // Resolved to investors.id (investor-capital.ts), NOT
    // project_company_structures — investors is the real per-LP/GP
    // entity with the contact + KYC chain.
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "restrict" }),
    allocatedUsd: numeric("allocated_usd", { precision: 14, scale: 2 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedUsd: numeric("received_usd", { precision: 14, scale: 2 }),
    wireRef: text("wire_ref"),
    /** Last reminder sent by the call-reminder cron. */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
  },
  (t) => [
    index("capital_call_allocations_call_idx").on(t.callId),
    index("capital_call_allocations_investor_received_idx").on(t.investorId, t.receivedAt),
  ],
);

export type CapitalCallAllocation = typeof capitalCallAllocations.$inferSelect;
export type NewCapitalCallAllocation = typeof capitalCallAllocations.$inferInsert;
