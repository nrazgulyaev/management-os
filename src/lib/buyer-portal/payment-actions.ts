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
import { projects, villas } from "@/lib/db/schema/projects";
import { documents } from "@/lib/db/schema/documents";
import { formatMoneyMinor } from "@/lib/money";
import { recordAuditEvent } from "@/features/audit/services";
import { receiptStoragePath } from "@/lib/buyer-portal/receipts";
import {
  renderReceiptPdf,
  uploadBuyerDocumentBytes,
  BUYER_DOC_BUCKET,
} from "@/lib/buyer-portal/document-pdf";

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

  // Generate a RECEIPT into the buyer's document vault. We render real PDF bytes
  // and upload them to the canonical documents bucket at a deterministic
  // per-milestone key (which is also the milestone → receipt join), then index a
  // `documents` row scoped to the villa and marked owner-visible so it lands in
  // the buyer doc-vault "Payment receipts" group AND is downloadable. Receipt
  // generation must not fail the payment, so it is best-effort: if storage is
  // not configured the row is still written byte-less (download simply absent).
  const villaId = villaIdByGroupId.get(milestone.contractGroupId) ?? null;
  let receiptDocumentId: string | null = null;
  if (villaId) {
    try {
      const receiptNumber = `RCP-${now.getUTCFullYear()}-${milestone.id.slice(0, 8).toUpperCase()}`;
      const amountLabel = formatMoneyMinor(newPaid, "USD");
      const storagePath = receiptStoragePath(milestone.id);

      // Villa label for the printed receipt (best-effort). We also pull
      // the org via villa -> project so the receipt document is scoped.
      const [villa] = await db
        .select({
          unitCode: villas.unitCode,
          name: villas.name,
          organizationId: projects.organizationId,
        })
        .from(villas)
        .leftJoin(projects, eq(projects.id, villas.projectId))
        .where(eq(villas.id, villaId))
        .limit(1);
      const villaLabel =
        villa?.name ?? villa?.unitCode ?? `Villa ${villaId.slice(0, 8)}`;

      // Render + upload the PDF bytes. Upload is best-effort; on failure the row
      // is written without storage columns and the doc vault shows no download.
      const bytes = await renderReceiptPdf({
        receiptNumber,
        buyerName: session.displayName,
        buyerCode: session.buyerCode,
        villaLabel,
        milestoneName: milestone.name,
        amountMinor: newPaid,
        currency: "USD",
        paidAt: now,
      });
      const upload = await uploadBuyerDocumentBytes(storagePath, bytes);

      const [doc] = await db
        .insert(documents)
        .values({
          // TENANCY-FINANCE-DOCS — org via villa -> project (buyer portal).
          organizationId: villa?.organizationId ?? null,
          title: `Receipt ${receiptNumber} — ${milestone.name} (${amountLabel})`,
          documentType: "receipt",
          entityType: "villa",
          entityId: villaId,
          // Owner-visible so the buyer doc vault surfaces it.
          visibility: "owner",
          visibleToOwner: true,
          status: "active",
          // `storage_path` doubles as the milestone → receipt join sentinel AND
          // the real Supabase object key. `storage_bucket` is set only when the
          // upload succeeded, which is what the doc vault keys "downloadable" off.
          storagePath,
          storageBucket: upload.ok ? upload.bucket ?? BUYER_DOC_BUCKET : null,
          fileName: upload.ok ? `${receiptNumber}.pdf` : null,
          mimeType: upload.ok ? "application/pdf" : null,
          sizeBytes: upload.ok ? upload.sizeBytes ?? null : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: documents.id });
      receiptDocumentId = doc?.id ?? null;
    } catch (err) {
      // Receipt is a side-effect; never break the recorded payment.
      console.error("[buyer-portal] receipt generation failed", err);
    }
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
