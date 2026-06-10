-- WRITE-FLOW-AUDIT — fix-finance-actions
-- Tenancy column for the payout ledger.
--
-- `payout_batches` and `payout_lines` were the only finance-ledger
-- tables WITHOUT an organization_id, which left
-- createPayoutBatch / createPayoutLine / setPayoutLineStatus
-- unscopeable — a foreign payout-line id could be marked "paid" by
-- any caller (cross-tenant IDOR on a money-moving row).
--
-- This adds organization_id (NULLABLE — same pattern as
-- owner_statements / migration 0104) so the server actions can scope
-- every read and write with `WHERE organization_id = requireOrgId()`.
-- The platform is single-tenant today (all rows = ARCONIQUE_DEFAULT),
-- so the backfill is a no-op behaviour-wise — it only closes the
-- multi-tenant hole.
--
-- Backfill order (most-specific parent first):
--   payout_lines.organization_id  ← linked owner_statements.organization_id
--   payout_lines.organization_id  ← sibling lines in the same batch
--   payout_batches.organization_id ← any line in the batch
--   remaining NULLs                ← ARCONIQUE_DEFAULT seed org
--
-- Idempotent — ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS,
-- and the backfill only touches rows still NULL.

BEGIN;

-- 1. Columns (nullable; FK RESTRICT to mirror owner_statements).
ALTER TABLE "payout_batches"
  ADD COLUMN IF NOT EXISTS "organization_id" UUID
    REFERENCES "organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "payout_lines"
  ADD COLUMN IF NOT EXISTS "organization_id" UUID
    REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- 2. Backfill payout_lines from the linked statement's org.
UPDATE "payout_lines" pl
   SET "organization_id" = os."organization_id"
  FROM "owner_statements" os
 WHERE pl."statement_id" = os."id"
   AND pl."organization_id" IS NULL
   AND os."organization_id" IS NOT NULL;

-- 3. Backfill payout_batches from any line in the batch that now has an org.
UPDATE "payout_batches" pb
   SET "organization_id" = pl."organization_id"
  FROM "payout_lines" pl
 WHERE pl."payout_batch_id" = pb."id"
   AND pb."organization_id" IS NULL
   AND pl."organization_id" IS NOT NULL;

-- 4. Backfill remaining payout_lines from their batch's org.
UPDATE "payout_lines" pl
   SET "organization_id" = pb."organization_id"
  FROM "payout_batches" pb
 WHERE pl."payout_batch_id" = pb."id"
   AND pl."organization_id" IS NULL
   AND pb."organization_id" IS NOT NULL;

-- 5. Anything still NULL → ARCONIQUE_DEFAULT seed org (single-tenant today).
UPDATE "payout_batches"
   SET "organization_id" = (
     SELECT id FROM "organizations" WHERE organization_code = 'ARCONIQUE_DEFAULT'
   )
 WHERE "organization_id" IS NULL
   AND EXISTS (SELECT 1 FROM "organizations" WHERE organization_code = 'ARCONIQUE_DEFAULT');

UPDATE "payout_lines"
   SET "organization_id" = (
     SELECT id FROM "organizations" WHERE organization_code = 'ARCONIQUE_DEFAULT'
   )
 WHERE "organization_id" IS NULL
   AND EXISTS (SELECT 1 FROM "organizations" WHERE organization_code = 'ARCONIQUE_DEFAULT');

-- 6. Lookup indexes for the org-scoped reads/writes.
CREATE INDEX IF NOT EXISTS "payout_batches_org_idx"
  ON "payout_batches" ("organization_id");

CREATE INDEX IF NOT EXISTS "payout_lines_org_idx"
  ON "payout_lines" ("organization_id");

COMMIT;
