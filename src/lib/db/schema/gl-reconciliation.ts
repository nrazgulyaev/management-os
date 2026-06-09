/**
 * GL bank-reconciliation match table (migration 0136).
 *
 * Links an imported bank line (`bank_transactions`) to a posted GL journal
 * entry (`journal_entries`). The existing reconciliation layer matches bank
 * lines to invoices / dev-transactions; this closes the gap to the
 * double-entry GL so the bank statement ties to the books. Money is bigint
 * MINOR units. Org-scoped.
 */

import {
  pgTable,
  uuid,
  text,
  bigint,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";
import { bankTransactions } from "./banking";
import { journalEntries } from "./general-ledger";

export const glBankReconciliationMatches = pgTable(
  "gl_bank_reconciliation_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    bankTransactionId: uuid("bank_transaction_id")
      .notNull()
      .references(() => bankTransactions.id, { onDelete: "cascade" }),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    /** Snapshot of the bank line amount at match time (signed minor units). */
    bankAmountMinor: bigint("bank_amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    /** manual | auto_source | rule */
    matchMethod: text("match_method").notNull().default("manual"),
    /** abs delta between bank line and journal net (minor units); 0 = exact. */
    varianceMinor: bigint("variance_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    note: text("note"),
    matchedBy: uuid("matched_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("gl_recon_match_bank_txn_unique").on(t.bankTransactionId),
    index("gl_recon_match_entry_idx").on(t.journalEntryId),
    index("gl_recon_match_org_idx").on(t.organizationId),
  ],
);

export type GlBankReconciliationMatch =
  typeof glBankReconciliationMatches.$inferSelect;
export type NewGlBankReconciliationMatch =
  typeof glBankReconciliationMatches.$inferInsert;
