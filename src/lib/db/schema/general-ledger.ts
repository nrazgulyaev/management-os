/**
 * Double-entry General Ledger foundation (migration 0122).
 *
 * Additive proving-spine over the existing finance sub-ledgers — see
 * drizzle/0122_general_ledger_foundation.sql. Money is bigint MINOR units.
 * Per-entry debit/credit must net to zero (enforced in postJournal()).
 */

import {
  pgTable,
  uuid,
  text,
  bigint,
  date,
  timestamp,
  integer,
  index,
  uniqueIndex,
  check,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./saas";
import { appUsers } from "./identity";
import { statementPeriods } from "./finance";

/** chart_of_accounts — the account dimension. Org-scoped (each org seeds
 *  its own COA from the standard set). */
export const chartOfAccounts = pgTable(
  "chart_of_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** asset | liability | equity | revenue | expense */
    type: text("type").notNull(),
    /** debit | credit */
    normalBalance: text("normal_balance").notNull(),
    parentCode: text("parent_code"),
    isActive: boolean("is_active").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("coa_org_code_unique").on(t.organizationId, t.code),
    index("coa_org_type_idx").on(t.organizationId, t.type),
  ],
);

/** journal_entries — balanced entry header. Append-only (reversals post a
 *  mirror entry; never UPDATE/DELETE a posted entry). */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    periodId: uuid("period_id").references(() => statementPeriods.id, {
      onDelete: "restrict",
    }),
    entryDate: date("entry_date").notNull(),
    currency: text("currency").notNull().default("USD"),
    memo: text("memo"),
    /** polymorphic provenance, e.g. 'revenue_lines' */
    sourceTable: text("source_table"),
    sourceId: uuid("source_id"),
    externalRef: text("external_ref"),
    /** posted | void */
    status: text("status").notNull().default("posted"),
    reversesEntryId: uuid("reverses_entry_id"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("je_org_date_idx").on(t.organizationId, t.entryDate),
    uniqueIndex("je_source_unique").on(t.sourceTable, t.sourceId),
    index("je_period_idx").on(t.periodId),
  ],
);

/** journal_lines — exactly one of debit/credit nonzero; all lines per
 *  entry net to zero (entry-level invariant asserted in postJournal). */
export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    debitMinor: bigint("debit_minor", { mode: "bigint" }).notNull().default(0n),
    creditMinor: bigint("credit_minor", { mode: "bigint" }).notNull().default(0n),
    currency: text("currency").notNull().default("USD"),
    lineMemo: text("line_memo"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("jl_entry_idx").on(t.entryId),
    index("jl_account_idx").on(t.accountId),
    index("jl_org_account_idx").on(t.organizationId, t.accountId),
    check(
      "jl_one_side_nonzero",
      sql`("debit_minor" >= 0 AND "credit_minor" >= 0 AND (("debit_minor" = 0) <> ("credit_minor" = 0)))`,
    ),
  ],
);

export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;
