/**
 * Stage 4.B.2 — Append-only wallet movement log.
 *
 * Distinct from existing `wallet_transactions` (Stage 2.3): movements
 * carry the new `affects_balance` bucket dimension introduced by the
 * Stage 4.B.2 cash-vs-economic-vs-reinvestment split, plus richer
 * cross-project linkage (`source_project_id` / `target_project_id`)
 * for reinvestment audit trails.
 *
 * Cross-project capital movements always write a *pair*:
 *   - 1× `reinvestment_out` from source wallet
 *   - 1× `reinvestment_in`  to target wallet
 * inside one Drizzle transaction.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  bigint,
  index,
} from "drizzle-orm/pg-core";
import { investorWallets, investors, distributions, capitalCommitments, capitalDrawdowns } from "./investor-capital";
import { projects } from "./projects";
import { appUsers } from "./identity";

export const walletMovements = pgTable(
  "wallet_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    walletId: uuid("wallet_id")
      .notNull()
      .references(() => investorWallets.id, { onDelete: "cascade" }),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id),

    /**
     * 'capital_contribution' | 'capital_return' | 'profit_distribution'
     * | 'reinvestment_out' | 'reinvestment_in'
     * | 'withdrawal_request' | 'withdrawal_executed'
     * | 'manual_adjustment' | 'residual_inventory_realloc'
     */
    movementType: text("movement_type").notNull(),

    /** Signed: positive credits the bucket, negative debits. */
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    fxRateToUsd: numeric("fx_rate_to_usd", { precision: 15, scale: 8 })
      .notNull()
      .default("1.0"),

    /**
     * 'cash' | 'economic' | 'reinvestment' | 'committed'
     * | 'pending_distribution' | 'residual_inventory'
     */
    affectsBalance: text("affects_balance").notNull(),

    sourceProjectId: uuid("source_project_id").references(() => projects.id),
    targetProjectId: uuid("target_project_id").references(() => projects.id),
    relatedDistributionId: uuid("related_distribution_id").references(
      () => distributions.id,
    ),
    relatedCommitmentId: uuid("related_commitment_id").references(
      () => capitalCommitments.id,
    ),
    relatedDrawdownId: uuid("related_drawdown_id").references(
      () => capitalDrawdowns.id,
    ),
    /** Forward-typed; FK declared in migration 0049 after residual_inventory_units exists. */
    relatedResidualUnitId: uuid("related_residual_unit_id"),

    /** 'recorded' | 'pending' | 'reversed' | 'voided' */
    status: text("status").notNull().default("recorded"),

    effectedAt: timestamp("effected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectedBy: uuid("effected_by").references(() => appUsers.id),
    reason: text("reason"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    walletIdx: index("wallet_movements_wallet_idx").on(t.walletId),
    investorIdx: index("wallet_movements_investor_idx").on(t.investorId),
    typeIdx: index("wallet_movements_type_idx").on(t.movementType),
    sourceProjectIdx: index("wallet_movements_source_project_idx").on(
      t.sourceProjectId,
    ),
    targetProjectIdx: index("wallet_movements_target_project_idx").on(
      t.targetProjectId,
    ),
  }),
);

export type WalletMovement = typeof walletMovements.$inferSelect;
export type NewWalletMovement = typeof walletMovements.$inferInsert;
