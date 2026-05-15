/**
 * Stage 4.B.3 — Investor portal write requests.
 *
 * Withdrawal/reinvest/transfer requests submitted by investors via the
 * portal, gated through `submitted → under_review → approved → executed`
 * (or rejected/cancelled). Execution is operator-driven only — no auto-
 * execute path.
 *
 * Schema-name reconciliation: spec used `commitments(id)`; actual table
 * is `capital_commitments`.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  bigint,
  index,
} from "drizzle-orm/pg-core";
import { investors, capitalCommitments, distributions } from "./investor-capital";
import { projects } from "./projects";
import { walletMovements } from "./wallet-movements";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const investorPortalRequests = pgTable(
  "investor_portal_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id),
    requestCode: text("request_code").notNull().unique(),

    /**
     * 'withdrawal' | 'reinvest_to_project'
     * | 'transfer_between_projects' | 'capital_call_response'
     */
    requestType: text("request_type").notNull(),

    requestedAmountMinor: bigint("requested_amount_minor", {
      mode: "bigint",
    }).notNull(),
    currency: text("currency").notNull().default("USD"),

    sourceProjectId: uuid("source_project_id").references(() => projects.id),
    targetProjectId: uuid("target_project_id").references(() => projects.id),
    relatedDistributionId: uuid("related_distribution_id").references(
      () => distributions.id,
    ),
    relatedCommitmentId: uuid("related_commitment_id").references(
      () => capitalCommitments.id,
    ),

    investorNotes: text("investor_notes"),
    preferredExecutionDate: date("preferred_execution_date"),

    /**
     * 'submitted' | 'under_review' | 'approved' | 'executed'
     * | 'rejected' | 'cancelled'
     */
    status: text("status").notNull().default("submitted"),

    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id),
    approvalNotes: text("approval_notes"),
    rejectionReason: text("rejection_reason"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    relatedWalletMovementId: uuid("related_wallet_movement_id").references(
      () => walletMovements.id,
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    investorIdx: index("investor_portal_requests_investor_idx").on(t.investorId),
    statusIdx: index("investor_portal_requests_status_idx").on(t.status),
    typeIdx: index("investor_portal_requests_type_idx").on(t.requestType),
  }),
);

export type InvestorPortalRequest = typeof investorPortalRequests.$inferSelect;
export type NewInvestorPortalRequest =
  typeof investorPortalRequests.$inferInsert;
