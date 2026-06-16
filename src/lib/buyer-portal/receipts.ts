import "server-only";

import { and, eq, inArray, like } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buyers, buyerUnitAssignments } from "@/lib/db/schema/buyers";
import { documents } from "@/lib/db/schema/documents";

/**
 * Buyer-portal receipts data layer — the milestone → receipt join.
 *
 * When a buyer marks an installment paid (see payment-actions.ts) we index a
 * `documents` row of type `receipt` scoped to the villa, with the milestone id
 * encoded into `storage_path` (`receipt/milestone/<milestoneId>.pdf`). The
 * `documents` table has no milestone FK and no JSON metadata column, so this
 * deterministic path is how a paid milestone finds its receipt WITHOUT a
 * migration — and because it is also a real Supabase object key, the rendered
 * receipt PDF bytes upload to exactly that path, so the doc-vault row is
 * downloadable. (Legacy metadata-only rows used the same prefix WITHOUT the
 * `.pdf` suffix and no bytes; the helpers below still resolve their milestone
 * id so the join keeps working for both.)
 *
 * This module is `server-only` but deliberately NOT a "use server" action
 * module, so it can export the sync `receiptStoragePath` / `milestoneIdFrom`
 * helpers that both the mark-paid action and these read queries share.
 */

const RECEIPT_PATH_PREFIX = "receipt/milestone/";

/**
 * Deterministic Supabase object key + milestone link for a receipt PDF. Real
 * object key (ends `.pdf`) so the rendered bytes upload here and the doc vault
 * can hand back a signed download URL.
 */
export function receiptStoragePath(milestoneId: string): string {
  return `${RECEIPT_PATH_PREFIX}${milestoneId}.pdf`;
}

/** Recover the milestone id from a receipt path (null if not one). */
export function milestoneIdFromReceiptPath(path: string | null): string | null {
  if (!path || !path.startsWith(RECEIPT_PATH_PREFIX)) return null;
  const rest = path.slice(RECEIPT_PATH_PREFIX.length).replace(/\.pdf$/i, "");
  return rest || null;
}

export interface BuyerReceipt {
  documentId: string;
  milestoneId: string;
  title: string;
  receiptNumber: string | null;
  issuedAt: Date;
}

/** Pull a buyer-friendly receipt number out of the indexed title, if present. */
function receiptNumberFromTitle(title: string): string | null {
  const match = title.match(/RCP-\d{4}-[0-9A-Z]+/);
  return match ? match[0] : null;
}

/**
 * Returns the buyer's payment receipts keyed by the milestone they belong to.
 * Scoped to the authenticated buyer through their assigned villas; never reads
 * receipts for a villa the buyer is not assigned to.
 */
export async function getBuyerReceiptsByMilestone(
  buyerId: string,
): Promise<Map<string, BuyerReceipt>> {
  const byMilestone = new Map<string, BuyerReceipt>();
  const db = getDb();
  if (!db) return byMilestone;

  // 0. Resolve the buyer's own org so the assignment chain + the shared
  //    `documents` read are both bounded to the buyer's tenant.
  const [buyer] = await db
    .select({ organizationId: buyers.organizationId })
    .from(buyers)
    .where(eq(buyers.id, buyerId))
    .limit(1);
  if (!buyer) return byMilestone;
  const orgId = buyer.organizationId;

  // 1. The buyer's assigned villas (ownership scope, org-bounded).
  const assignments = await db
    .select({ unitId: buyerUnitAssignments.unitId })
    .from(buyerUnitAssignments)
    .where(
      and(
        eq(buyerUnitAssignments.buyerId, buyerId),
        eq(buyerUnitAssignments.organizationId, orgId),
      ),
    );
  const unitIds = [...new Set(assignments.map((a) => a.unitId))];
  if (unitIds.length === 0) return byMilestone;

  // 2. Receipt documents scoped to those villas, with a milestone sentinel
  //    (org-bounded against the shared `documents` table).
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      storagePath: documents.storagePath,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, orgId),
        eq(documents.documentType, "receipt"),
        eq(documents.entityType, "villa"),
        inArray(documents.entityId, unitIds),
        eq(documents.status, "active"),
        like(documents.storagePath, `${RECEIPT_PATH_PREFIX}%`),
      ),
    );

  for (const r of rows) {
    const milestoneId = milestoneIdFromReceiptPath(r.storagePath);
    if (!milestoneId) continue;
    const existing = byMilestone.get(milestoneId);
    // Keep the most recent receipt per milestone.
    if (existing && existing.issuedAt >= r.createdAt) continue;
    byMilestone.set(milestoneId, {
      documentId: r.id,
      milestoneId,
      title: r.title,
      receiptNumber: receiptNumberFromTitle(r.title),
      issuedAt: r.createdAt,
    });
  }

  return byMilestone;
}
