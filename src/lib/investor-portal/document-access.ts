import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireInvestorSession } from "./session";

/**
 * Per-document authorization for the investor portal download route.
 *
 * The shared /api/documents/[id]/download endpoint only org-scopes, which lets
 * one investor enumerate another investor's subscription agreement / drawdown
 * receipt (or an internal-only doc). This re-verifies, using the SAME
 * entitlement as the documents listing (getMyDocuments): the document must be
 * the agreement_document_id of one of THIS investor's commitments, or the
 * receipt_document_id of one of their drawdowns.
 */
export async function investorCanAccessDocument(documentId: string): Promise<boolean> {
  const session = await requireInvestorSession();
  const db = getDb();
  if (!db) return false;
  const rows = await db.execute(sql`
    SELECT 1
      FROM capital_commitments cc
     WHERE cc.investor_id = ${session.investorId}
       AND cc.agreement_document_id = ${documentId}
    UNION ALL
    SELECT 1
      FROM capital_drawdowns dd
      JOIN capital_commitments cc ON cc.id = dd.commitment_id
     WHERE cc.investor_id = ${session.investorId}
       AND dd.receipt_document_id = ${documentId}
    LIMIT 1
  `);
  return (rows as unknown[]).length > 0;
}
