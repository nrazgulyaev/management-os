"use server";

/**
 * Buyer-scoped manual "mark paid" for a contract installment milestone.
 *
 * There is NO real payment-service-provider yet (Indonesia rails are deferred
 * to launch) — this is the manual mark-paid path. It DELIBERATELY does not
 * reuse `recordMilestonePayment` from the developer module: that action is
 * developer-trusted and takes an arbitrary amount + fx rate with no buyer
 * ownership check. Here we re-validate that the milestone belongs to the
 * authenticated buyer (session → buyer_unit_assignments → contract_groups →
 * contract_milestones) BEFORE writing, then record the FULL remaining balance
 * as paid (buyers cannot key in arbitrary partials).
 *
 * Security note: the buyer session gates access and we scope every query
 * through the verified assignment chain server-side. If buyer-role RLS on
 * `contract_milestones` / `contract_groups` is later hardened, this action
 * already passes the ownership check independently of RLS.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyerUnitAssignments } from "@/lib/db/schema/buyers";
import { contractGroups, contractMilestones } from "@/lib/db/schema/sales";
import { recordAuditEvent } from "@/features/audit/services";
import { persistMilestoneReceipt } from "@/lib/buyer-portal/document-pdf";

const markPaidSchema = z.object({ milestoneId: z.string().uuid() });

export async function markBuyerInstallmentPaid(input: {
  milestoneId: string;
}): Promise<{ ok: boolean; error?: string; nowPaid?: boolean }> {
  const parsed = markPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const session = await getBuyerSession();
  if (!session) return { ok: false, error: "Not authenticated." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // 1. Resolve the buyer's villas (units) from their assignments.
  const assignments = await db
    .select({ unitId: buyerUnitAssignments.unitId })
    .from(buyerUnitAssignments)
    .where(eq(buyerUnitAssignments.buyerId, session.buyerId));
  const unitIds = assignments.map((a) => a.unitId);
  if (unitIds.length === 0) return { ok: false, error: "No villas assigned." };

  // 2. Resolve the contract groups for those villas.
  const groups = await db
    .select({ id: contractGroups.id, villaId: contractGroups.villaId })
    .from(contractGroups)
    .where(inArray(contractGroups.villaId, unitIds));
  const groupIds = groups.map((g) => g.id);
  const villaIdByGroupId = new Map(groups.map((g) => [g.id, g.villaId]));
  if (groupIds.length === 0) {
    return { ok: false, error: "No contract found for your villas." };
  }

  // 3. Load the milestone AND verify it belongs to one of the buyer's groups.
  const [milestone] = await db
    .select()
    .from(contractMilestones)
    .where(
      and(
        eq(contractMilestones.id, parsed.data.milestoneId),
        inArray(contractMilestones.contractGroupId, groupIds),
      ),
    )
    .limit(1);
  if (!milestone) {
    // Either the milestone does not exist or it is not the buyer's. Do not
    // leak which — return a generic ownership error.
    return { ok: false, error: "Installment not found." };
  }

  if (milestone.status === "paid") {
    return { ok: false, error: "This installment is already paid." };
  }
  if (milestone.status === "waived" || milestone.status === "cancelled") {
    return { ok: false, error: "This installment cannot be paid." };
  }

  // Record the FULL remaining balance as paid (manual mark-paid; no partials
  // from the buyer side). Money stays in bigint MINOR units throughout.
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
      notes: `${milestone.notes ?? ""}\nMarked paid by buyer ${session.buyerCode} via portal (manual).`.trim(),
      updatedAt: now,
    })
    .where(eq(contractMilestones.id, milestone.id));

  // Generate a RECEIPT into the buyer's document vault via the shared
  // receipt-on-pay writer (also used by the operator installments desk). It
  // renders real PDF bytes, uploads them to the canonical documents bucket at
  // the deterministic per-milestone key (the milestone → receipt join), and
  // indexes an owner-visible `documents` row scoped to the villa so it lands in
  // the buyer doc-vault "Payment receipts" group AND is downloadable. It is
  // best-effort: receipt generation must never fail the recorded payment.
  const villaId = villaIdByGroupId.get(milestone.contractGroupId) ?? null;
  let receiptDocumentId: string | null = null;
  if (villaId) {
    const receipt = await persistMilestoneReceipt({
      milestoneId: milestone.id,
      milestoneName: milestone.name,
      villaId,
      amountMinor: newPaid,
      buyerName: session.displayName,
      buyerCode: session.buyerCode,
      paidAt: now,
      methodLabel: "Manual confirmation (buyer portal)",
    });
    receiptDocumentId = receipt.documentId;
  }

  await recordAuditEvent({
    // Buyers are supabase auth users, not app_users — keep actor null and
    // carry buyer identity in metadata.
    actorUserId: null,
    action: "contract_milestone.buyer_marked_paid",
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
      buyerId: session.buyerId,
      buyerCode: session.buyerCode,
      contractGroupId: milestone.contractGroupId,
      channel: "buyer_portal",
      method: "manual_mark_paid",
      receiptDocumentId,
    },
  });

  revalidatePath("/buyer-portal/payments");
  revalidatePath("/buyer-portal/documents");
  return { ok: true, nowPaid: true };
}
