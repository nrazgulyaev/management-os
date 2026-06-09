-- 0136 — GL bank-reconciliation matches (Block 05 accounting depth).
--
-- Links an imported bank line (`bank_transactions`) to a posted GL
-- journal entry (`journal_entries`) so the bookkeeper can tie the bank
-- statement to the books. The existing reconciliation layer matches bank
-- lines to INVOICES / dev-transactions (bank_transactions.matched_*), but
-- there was no link from a bank line to the double-entry GL — this table
-- closes that gap.
--
-- A bank line may match exactly one journal entry (the unique index on
-- bank_transaction_id enforces one live match per line). Append-only at the
-- match grain: unmatching deletes the row (the audit log keeps the trail).
-- Money stays bigint MINOR units. Multi-tenant (organization_id NOT NULL).
-- Idempotent.

CREATE TABLE IF NOT EXISTS "gl_bank_reconciliation_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "bank_transaction_id" uuid NOT NULL
    REFERENCES "bank_transactions"("id") ON DELETE cascade,
  "journal_entry_id" uuid NOT NULL
    REFERENCES "journal_entries"("id") ON DELETE cascade,
  -- snapshot of the bank line amount at match time (minor units, signed:
  -- positive = credit/inflow, negative = debit/outflow per provider parsers)
  "bank_amount_minor" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  -- how the match was made: manual | auto_source | rule
  "match_method" text NOT NULL DEFAULT 'manual',
  -- abs delta between bank line and journal entry net (minor units); 0 = exact
  "variance_minor" bigint NOT NULL DEFAULT 0,
  "note" text,
  "matched_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- One live GL match per bank line.
CREATE UNIQUE INDEX IF NOT EXISTS "gl_recon_match_bank_txn_unique"
  ON "gl_bank_reconciliation_matches" ("bank_transaction_id");
CREATE INDEX IF NOT EXISTS "gl_recon_match_entry_idx"
  ON "gl_bank_reconciliation_matches" ("journal_entry_id");
CREATE INDEX IF NOT EXISTS "gl_recon_match_org_idx"
  ON "gl_bank_reconciliation_matches" ("organization_id");
