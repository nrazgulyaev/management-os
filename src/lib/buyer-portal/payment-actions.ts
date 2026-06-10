"use server";

/**
 * Buyer-scoped manual "mark paid" for a contract installment milestone.
 *
 * This is the manual mark-paid path (off-platform transfer, buyer confirms).
 * The online path (Xendit invoice → webhook) settles through the SAME core —
 * see src/features/payments/installment-settlement.ts; this action keeps the
 * buyer-session ownership gate and delegates the money write to that core.
 * It DELIBERATELY does not
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
import { settleContractMilestonePaid } from "@/features/payments/installment-settlement";

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

  // Settle through the SHARED settlement core (same code path the Xendit
  // webhook uses): full remaining balance, receipt PDF into the buyer doc
  // vault (best-effort), audit event. Buyers are supabase auth users, not
  // app_users — actor stays null and buyer identity rides in the metadata.
  const settled = await settleContractMilestonePaid({
    milestoneId: milestone.id,
    methodLabel: "Manual confirmation (buyer portal)",
    noteLine: `Marked paid by buyer ${session.buyerCode} via portal (manual).`,
    buyerName: session.displayName,
    buyerCode: session.buyerCode,
    auditAction: "contract_milestone.buyer_marked_paid",
    auditMetadata: {
      buyerId: session.buyerId,
      buyerCode: session.buyerCode,
      channel: "buyer_portal",
      method: "manual_mark_paid",
    },
  });
  if (!settled.ok) return { ok: false, error: settled.error };
  if (settled.alreadyPaid) {
    // Raced with a webhook / second tab — already settled, nothing to redo.
    return { ok: false, error: "This installment is already paid." };
  }

  revalidatePath("/buyer-portal/payments");
  revalidatePath("/buyer-portal/documents");
  return { ok: true, nowPaid: true };
}
