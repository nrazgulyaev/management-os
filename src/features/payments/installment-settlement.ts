/**
 * Shared buyer-installment settlement core — the ONE place a contract
 * milestone flips to `paid` from a buyer-side payment.
 *
 * Two callers, same money logic (no parallel paths by design):
 *   1. Manual mark-paid (src/lib/buyer-portal/payment-actions.ts) —
 *      buyer confirms an off-platform transfer; the action gates on the
 *      buyer session + ownership chain, then delegates here.
 *   2. Xendit webhook (src/app/api/webhooks/xendit/route.ts) — a
 *      verified `invoice.paid` callback settles the linked milestone
 *      through this exact function.
 *
 * Behaviour (extracted verbatim from the original manual action):
 *   - Full remaining balance only — no partials from the buyer side.
 *   - Money stays bigint USD MINOR units throughout.
 *   - Receipt PDF generation is best-effort and never fails the
 *     recorded payment.
 *   - Already-paid milestones return `{ ok: true, alreadyPaid: true }`
 *     so webhook retries are idempotent (callers that want to surface
 *     "already paid" as an error check the flag).
 *
 * AUTH IS THE CALLER'S JOB. This module performs no session or webhook
 * verification — never export it to a client surface.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contractGroups, contractMilestones } from "@/lib/db/schema/sales";
import { recordAuditEvent } from "@/features/audit/services";
import { persistMilestoneReceipt } from "@/lib/buyer-portal/document-pdf";

export interface SettleInstallmentInput {
  milestoneId: string;
  /** Printed on the receipt "Method" line, e.g.
   *  "Manual confirmation (buyer portal)" or "Xendit online payment (QRIS)". */
  methodLabel: string;
  /** Appended to the milestone `notes` column for traceability. */
  noteLine: string;
  /** Receipt identity — printed as "Issued to". */
  buyerName: string;
  buyerCode: string;
  /** Audit envelope. Actor is null for both callers (buyer sessions and
   *  webhooks are not app_users); identity goes in the metadata. */
  auditAction: string;
  auditMetadata?: Record<string, unknown>;
}

export type SettleInstallmentResult =
  | {
      ok: true;
      alreadyPaid: boolean;
      receiptDocumentId: string | null;
      paidAmountUsdMinor: bigint;
    }
  | { ok: false; error: string };

export async function settleContractMilestonePaid(
  input: SettleInstallmentInput,
): Promise<SettleInstallmentResult> {
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [milestone] = await db
    .select()
    .from(contractMilestones)
    .where(eq(contractMilestones.id, input.milestoneId))
    .limit(1);
  if (!milestone) return { ok: false, error: "Installment not found." };

  if (milestone.status === "paid") {
    return {
      ok: true,
      alreadyPaid: true,
      receiptDocumentId: null,
      paidAmountUsdMinor: milestone.paidAmountUsdMinor,
    };
  }
  if (milestone.status === "waived" || milestone.status === "cancelled") {
    return { ok: false, error: "This installment cannot be paid." };
  }

  // Record the FULL remaining balance as paid (no partials from the buyer
  // side). Money stays in bigint MINOR units throughout.
  const remaining =
    milestone.expectedAmountUsdMinor - milestone.paidAmountUsdMinor;
  const newPaid =
    remaining > 0n
      ? milestone.expectedAmountUsdMinor
      : milestone.paidAmountUsdMinor;
  const now = new Date();

  await db
    .update(contractMilestones)
    .set({
      paidAmountUsdMinor: newPaid,
      status: "paid",
      paidAt: now,
      notes: `${milestone.notes ?? ""}\n${input.noteLine}`.trim(),
      updatedAt: now,
    })
    .where(eq(contractMilestones.id, milestone.id));

  // Receipt into the buyer's document vault — best-effort: receipt
  // generation must never fail the recorded payment.
  const [group] = await db
    .select({ villaId: contractGroups.villaId })
    .from(contractGroups)
    .where(eq(contractGroups.id, milestone.contractGroupId))
    .limit(1);
  const villaId = group?.villaId ?? null;
  let receiptDocumentId: string | null = null;
  if (villaId) {
    const receipt = await persistMilestoneReceipt({
      milestoneId: milestone.id,
      milestoneName: milestone.name,
      villaId,
      amountMinor: newPaid,
      buyerName: input.buyerName,
      buyerCode: input.buyerCode,
      paidAt: now,
      methodLabel: input.methodLabel,
    });
    receiptDocumentId = receipt.documentId;
  }

  await recordAuditEvent({
    actorUserId: null,
    action: input.auditAction,
    entityType: "contract_milestone",
    entityId: milestone.id,
    before: {
      status: milestone.status,
      paidAmountUsdMinor: milestone.paidAmountUsdMinor.toString(),
    },
    after: {
      status: "paid",
      paidAmountUsdMinor: newPaid.toString(),
    },
    metadata: {
      ...(input.auditMetadata ?? {}),
      contractGroupId: milestone.contractGroupId,
      receiptDocumentId,
    },
  });

  return {
    ok: true,
    alreadyPaid: false,
    receiptDocumentId,
    paidAmountUsdMinor: newPaid,
  };
}
