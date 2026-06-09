"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { materialPurchaseOrders } from "@/lib/db/schema/site-operations";
import { requireOrgId } from "@/features/auth/require-org";
import {
  requireInternalUser,
  getCurrentUserContext,
} from "@/features/auth/permissions";
import { recordAuditEvent } from "@/features/audit/services";
import { SUPPORTED_CURRENCIES } from "@/lib/development/constants/investor-constants";
import { recordTransaction } from "./transaction-actions";

/**
 * Procure-to-pay MONEY lifecycle for material POs — the `"use server"`
 * surface wired onto the PO detail page. The delivery lifecycle
 * (ordered → partially_delivered → fully_delivered) already lives in
 * `material-actions.ts`; this file adds the orthogonal money milestones the
 * design showed but the live UI never wired:
 *
 *   - Place order   (draft → ordered, stamps `placed_at`)
 *   - Confirm receipt (PO-level money milestone, stamps `received_at`)
 *   - Pay            (MANUAL mark-paid — records an `outflow` dev_transactions
 *                     row via recordTransaction, then advances the PO's
 *                     `payment_status` unpaid → partially_paid → paid and
 *                     accumulates `paid_amount_usd_minor`)
 *
 * Every write is permission-gated (`requireInternalUser`) and audit-logged
 * (`recordAuditEvent`). Money stays in BIGINT minor units throughout.
 * Mark-paid is MANUAL only — there is no real PSP (Indonesia rails deferred
 * to launch); "paying" means recording an outflow against the PO.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

async function loadPo(id: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [po] = await db
    .select()
    .from(materialPurchaseOrders)
    .where(
      and(
        eq(materialPurchaseOrders.id, id),
        eq(materialPurchaseOrders.organizationId, organizationId),
      ),
    )
    .limit(1);
  return { db, organizationId, po };
}

function revalidatePo(id: string) {
  revalidatePath(`/development-os/cabinets/procurement-manager/pos/${id}`);
  revalidatePath("/development-os/cabinets/procurement-manager/pos");
}

/** Place a draft order — draft → ordered, stamps `placed_at`. */
export async function placeOrderAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireInternalUser();
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Missing PO id.");
    const { db, organizationId, po } = await loadPo(id);
    if (!po) return fail("PO not found.");
    if (po.status === "cancelled") return fail("Cannot place a cancelled PO.");
    if (po.status !== "draft") {
      return fail("Only a draft PO can be placed.");
    }
    await db
      .update(materialPurchaseOrders)
      .set({ status: "ordered", placedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(materialPurchaseOrders.id, id),
          eq(materialPurchaseOrders.organizationId, organizationId),
        ),
      );

    const ctx = await getCurrentUserContext();
    await recordAuditEvent({
      actorUserId: ctx.appUser?.id ?? null,
      action: "material_po.place_order",
      entityType: "material_purchase_order",
      entityId: id,
      before: { status: po.status },
      after: { status: "ordered", organizationId },
    });
    revalidatePo(id);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Confirm receipt at the PO level (money milestone), stamps `received_at`. */
export async function confirmReceiptAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireInternalUser();
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Missing PO id.");
    const { db, organizationId, po } = await loadPo(id);
    if (!po) return fail("PO not found.");
    if (po.status === "cancelled") return fail("PO is cancelled.");
    if (po.status === "draft") {
      return fail("Place the order before confirming receipt.");
    }
    await db
      .update(materialPurchaseOrders)
      .set({
        status: "fully_delivered",
        receivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(materialPurchaseOrders.id, id),
          eq(materialPurchaseOrders.organizationId, organizationId),
        ),
      );

    const ctx = await getCurrentUserContext();
    await recordAuditEvent({
      actorUserId: ctx.appUser?.id ?? null,
      action: "material_po.confirm_receipt",
      entityType: "material_purchase_order",
      entityId: id,
      before: { status: po.status },
      after: { status: "fully_delivered", organizationId },
    });
    revalidatePo(id);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

const markPaidSchema = z.object({
  poId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  amountMinor: z.union([z.bigint(), z.string(), z.number()]),
  currency: z.enum(SUPPORTED_CURRENCIES),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
});

/**
 * Record a MANUAL payment against a PO. Inserts an `outflow`
 * dev_transactions row via `recordTransaction` (atomic — also updates the
 * bank balance + generates TXN code), then advances the PO's
 * `payment_status` and accumulates `paid_amount_usd_minor` from the USD
 * amount the transaction layer derived. No real PSP — manual only.
 */
export async function markPoPaidAction(formData: FormData): Promise<
  | { ok: true; transactionCode: string }
  | { ok: false; error: string }
> {
  try {
    await requireInternalUser();
    const parsed = markPaidSchema.safeParse({
      poId: formData.get("poId"),
      bankAccountId: formData.get("bankAccountId"),
      amountMinor: formData.get("amountMinor"),
      currency: formData.get("currency"),
      fxRate: formData.get("fxRate") || "1",
      transactionDate: formData.get("transactionDate"),
      description: formData.get("description"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid payment input.",
      };
    }

    const { db, organizationId, po } = await loadPo(parsed.data.poId);
    if (!po) return { ok: false, error: "PO not found." };
    if (po.status === "cancelled") {
      return { ok: false, error: "Cannot pay a cancelled PO." };
    }
    if (po.paymentStatus === "paid") {
      return { ok: false, error: "PO is already fully paid." };
    }

    // Records the real outflow + bank-balance update; returns the USD-minor
    // it derived so we accumulate the SAME number the ledger booked.
    const txn = await recordTransaction({
      bankAccountId: parsed.data.bankAccountId,
      direction: "outflow",
      projectId: po.projectId,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      fxRateAtTransaction: parsed.data.fxRate,
      transactionDate: parsed.data.transactionDate,
      description: parsed.data.description,
      externalReference: po.poCode,
    });

    const newPaidUsdMinor =
      BigInt(po.paidAmountUsdMinor) + BigInt(txn.amountUsdMinor);
    const totalUsdMinor = BigInt(po.totalAmountUsdMinor);
    const newPaymentStatus =
      newPaidUsdMinor >= totalUsdMinor ? "paid" : "partially_paid";

    await db
      .update(materialPurchaseOrders)
      .set({
        paidAmountUsdMinor: newPaidUsdMinor,
        paymentStatus: newPaymentStatus,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(materialPurchaseOrders.id, parsed.data.poId),
          eq(materialPurchaseOrders.organizationId, organizationId),
        ),
      );

    const ctx = await getCurrentUserContext();
    await recordAuditEvent({
      actorUserId: ctx.appUser?.id ?? null,
      action: "material_po.mark_paid",
      entityType: "material_purchase_order",
      entityId: parsed.data.poId,
      before: {
        paymentStatus: po.paymentStatus,
        paidAmountUsdMinor: BigInt(po.paidAmountUsdMinor).toString(),
      },
      after: {
        paymentStatus: newPaymentStatus,
        paidAmountUsdMinor: newPaidUsdMinor.toString(),
        organizationId,
      },
      metadata: {
        transactionCode: txn.transactionCode,
        amountUsdMinor: txn.amountUsdMinor,
        currency: parsed.data.currency,
      },
    });

    revalidatePo(parsed.data.poId);
    return { ok: true, transactionCode: txn.transactionCode };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
