import "server-only";

import { and, eq, inArray, like } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buyerUnitAssignments } from "@/lib/db/schema/buyers";
import { documents } from "@/lib/db/schema/documents";

/**
 * Buyer-portal receipts data layer — the milestone → receipt join.
 *
 * When a buyer marks an installment paid (see payment-actions.ts) we index a
 * metadata-only `documents` row of type `receipt` scoped to the villa, with the
 * milestone id stashed in `storage_path` as a stable sentinel
 * (`receipt/milestone/<milestoneId>`). The `documents` table has no milestone
 * FK and no JSON metadata column, so this sentinel is how a paid milestone
 * finds its receipt WITHOUT a migration. (`storage_bucket` stays null, so the
 * doc vault still shows the row as byte-less rather than offering a dead
 * download link.)
 *
 * This module is `server-only` but deliberately NOT a "use server" action
 * module, so it can export the sync `receiptStoragePath` / `milestoneIdFrom`
 * helpers that both the mark-paid action and these read queries share.
 */

const RECEIPT_PATH_PREFIX = "receipt/milestone/";

/** Stable sentinel stored in documents.storage_path for a milestone receipt. */
export function receiptStoragePath(milestoneId: string): string {
  return `${RECEIPT_PATH_PREFIX}${milestoneId}`;
}

/** Recover the milestone id from a receipt sentinel path (null if not one). */
export function milestoneIdFromReceiptPath(path: string | null): string | null {
  if (!path || !path.startsWith(RECEIPT_PATH_PREFIX)) return null;
  return path.slice(RECEIPT_PATH_PREFIX.length) || null;
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

  // 1. The buyer's assigned villas (ownership scope).
  const assignments = await db
    .select({ unitId: buyerUnitAssignments.unitId })
    .from(buyerUnitAssignments)
    .where(eq(buyerUnitAssignments.buyerId, buyerId));
  const unitIds = [...new Set(assignments.map((a) => a.unitId))];
  if (unitIds.length === 0) return byMilestone;

  // 2. Receipt documents scoped to those villas, with a milestone sentinel.
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
