"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  inventoryItems,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequestLines,
  purchaseRequests,
} from "@/lib/db/schema/inventory";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { applyMovement } from "@/features/inventory/actions";
import {
  PO_TRANSITIONS,
  PR_TRANSITIONS,
  canTransition,
  createPurchaseOrderSchema,
  createPurchaseRequestSchema,
  purchaseOrderIdSchema,
  purchaseRequestIdSchema,
  receivePurchaseOrderLineSchema,
} from "./schema";
import {
  buildPurchaseOrderCode,
  buildPurchaseRequestCode,
} from "./codes";
import { nextProcurementCounter } from "./services";
import type { ActionResult } from "@/features/projects/actions";

// -----------------------------------------------------------------------------
// Purchase requests
// -----------------------------------------------------------------------------

export async function createPurchaseRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("procurement.write");
  const parsed = createPurchaseRequestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const counter = await nextProcurementCounter("PR");
  const requestCode = buildPurchaseRequestCode(counter);

  const [row] = await db
    .insert(purchaseRequests)
    .values({
      requestCode,
      title: d.title,
      description: d.description && d.description !== "" ? d.description : null,
      priority: d.priority,
      projectId: d.projectId ?? null,
      villaId: d.villaId ?? null,
      supplierId: d.supplierId ?? null,
      requestedBy: me?.id ?? null,
      requiredBy: d.requiredBy && d.requiredBy !== "" ? d.requiredBy : null,
      totalEstimatedMinor: d.totalEstimatedMinor ?? null,
      currency: d.currency && d.currency !== "" ? d.currency : null,
      status: "draft",
    })
    .returning({ id: purchaseRequests.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "procurement.request.create",
    entityType: "purchase_request",
    entityId: row.id,
    after: { requestCode, title: d.title },
  });

  revalidatePath("/dashboard/procurement/requests");
  return { ok: true, redirectTo: `/dashboard/procurement/requests/${row.id}` };
}

async function transitionPurchaseRequest(
  formData: FormData,
  to: "submitted" | "approved" | "rejected" | "cancelled",
  permission: string,
): Promise<ActionResult> {
  await requirePermission(permission);
  const parsed = purchaseRequestIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [before] = await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Purchase request not found." };
  if (!canTransition(PR_TRANSITIONS, before.status, to)) {
    return { ok: false, error: `Cannot move PR from "${before.status}" to "${to}".` };
  }

  await db
    .update(purchaseRequests)
    .set({ status: to })
    .where(eq(purchaseRequests.id, parsed.data.id));

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `procurement.request.${to}`,
    entityType: "purchase_request",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: to },
  });

  revalidatePath("/dashboard/procurement/requests");
  revalidatePath(`/dashboard/procurement/requests/${parsed.data.id}`);
  return { ok: true };
}

export async function submitPurchaseRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transitionPurchaseRequest(formData, "submitted", "procurement.write");
}
export async function approvePurchaseRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transitionPurchaseRequest(formData, "approved", "procurement.approve");
}
export async function rejectPurchaseRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transitionPurchaseRequest(formData, "rejected", "procurement.approve");
}
export async function cancelPurchaseRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transitionPurchaseRequest(formData, "cancelled", "procurement.write");
}

// -----------------------------------------------------------------------------
// Purchase orders
// -----------------------------------------------------------------------------

export async function createPurchaseOrderFromRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("procurement.write");
  const parsed = purchaseRequestIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [pr] = await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, parsed.data.id))
    .limit(1);
  if (!pr) return { ok: false, error: "Purchase request not found." };
  if (pr.status !== "approved") {
    return { ok: false, error: "Only approved purchase requests can be ordered." };
  }

  const lines = await db
    .select()
    .from(purchaseRequestLines)
    .where(eq(purchaseRequestLines.requestId, pr.id));

  const counter = await nextProcurementCounter("PO");
  const poCode = buildPurchaseOrderCode(counter);

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poCode,
      requestId: pr.id,
      supplierId: pr.supplierId,
      projectId: pr.projectId,
      villaId: pr.villaId,
      orderedBy: me?.id ?? null,
      orderedAt: new Date(),
      currency: pr.currency,
      status: "draft",
    })
    .returning({ id: purchaseOrders.id });

  if (lines.length > 0) {
    await db.insert(purchaseOrderLines).values(
      lines.map((l) => ({
        purchaseOrderId: po.id,
        itemId: l.itemId,
        description: l.description,
        quantityOrdered: l.quantity,
        quantityReceived: "0",
        unit: l.unit,
        unitCostMinor: l.estimatedUnitCostMinor,
        currency: l.currency,
      })),
    );
  }

  await db
    .update(purchaseRequests)
    .set({ status: "ordered" })
    .where(eq(purchaseRequests.id, pr.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "procurement.order.create_from_request",
    entityType: "purchase_order",
    entityId: po.id,
    after: { poCode, requestId: pr.id },
  });

  revalidatePath("/dashboard/procurement/orders");
  return { ok: true, redirectTo: `/dashboard/procurement/orders/${po.id}` };
}

export async function createPurchaseOrderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("procurement.write");
  const parsed = createPurchaseOrderSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const counter = await nextProcurementCounter("PO");
  const poCode = buildPurchaseOrderCode(counter);

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poCode,
      supplierId: d.supplierId ?? null,
      projectId: d.projectId ?? null,
      villaId: d.villaId ?? null,
      requestId: d.requestId ?? null,
      orderedBy: me?.id ?? null,
      expectedDelivery: d.expectedDelivery && d.expectedDelivery !== "" ? d.expectedDelivery : null,
      currency: d.currency && d.currency !== "" ? d.currency : null,
      notes: d.notes && d.notes !== "" ? d.notes : null,
      status: "draft",
    })
    .returning({ id: purchaseOrders.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "procurement.order.create",
    entityType: "purchase_order",
    entityId: po.id,
    after: { poCode, supplierId: d.supplierId ?? null },
  });

  revalidatePath("/dashboard/procurement/orders");
  return { ok: true, redirectTo: `/dashboard/procurement/orders/${po.id}` };
}

async function transitionPurchaseOrder(
  formData: FormData,
  to: "sent" | "confirmed" | "cancelled",
): Promise<ActionResult> {
  await requirePermission("procurement.write");
  const parsed = purchaseOrderIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [before] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "PO not found." };
  if (!canTransition(PO_TRANSITIONS, before.status, to)) {
    return { ok: false, error: `Cannot move PO from "${before.status}" to "${to}".` };
  }

  const patch: Partial<typeof purchaseOrders.$inferInsert> = { status: to };
  if (to === "sent" && !before.orderedAt) patch.orderedAt = new Date();

  await db.update(purchaseOrders).set(patch).where(eq(purchaseOrders.id, parsed.data.id));
  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `procurement.order.${to}`,
    entityType: "purchase_order",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: to },
  });

  revalidatePath("/dashboard/procurement/orders");
  revalidatePath(`/dashboard/procurement/orders/${parsed.data.id}`);
  return { ok: true };
}

export async function sendPurchaseOrderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transitionPurchaseOrder(formData, "sent");
}
export async function confirmPurchaseOrderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transitionPurchaseOrder(formData, "confirmed");
}
export async function cancelPurchaseOrderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transitionPurchaseOrder(formData, "cancelled");
}

/**
 * Receive a quantity against a single PO line. Creates a `receive` movement
 * into the chosen location, increments line.quantity_received, and (if
 * every line is fully received) flips the PO to `received`. Otherwise
 * marks PO as `partially_received`.
 */
export async function receivePurchaseOrderLineAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("procurement.write");
  const parsed = receivePurchaseOrderLineSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: "Please review the receive form." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const [line] = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.id, d.lineId))
    .limit(1);
  if (!line) return { ok: false, error: "PO line not found." };
  if (line.purchaseOrderId !== d.purchaseOrderId) {
    return { ok: false, error: "Line does not belong to this PO." };
  }
  if (!line.itemId) {
    return { ok: false, error: "Line has no linked inventory item." };
  }

  if (d.receivedQuantity <= 0) {
    return { ok: false, error: "Received quantity must be > 0." };
  }

  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, line.itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Linked item is missing." };

  const movement = await applyMovement({
    itemId: line.itemId,
    type: "receive",
    quantity: d.receivedQuantity,
    toLocationId: d.toLocationId,
    purchaseOrderId: d.purchaseOrderId,
    unitCostMinor: line.unitCostMinor ?? item.unitCostMinor ?? null,
    currency: line.currency ?? item.currency ?? null,
    actorUserId: me?.id ?? null,
  });
  if ("error" in movement) return { ok: false, error: movement.error };

  const newReceived = parseFloat(line.quantityReceived) + d.receivedQuantity;
  await db
    .update(purchaseOrderLines)
    .set({ quantityReceived: String(newReceived), updatedAt: new Date() })
    .where(eq(purchaseOrderLines.id, line.id));

  // Refresh PO status: fully-received vs partial.
  const allLines = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, d.purchaseOrderId));
  const fullyReceived = allLines.every(
    (l) => parseFloat(l.quantityReceived) >= parseFloat(l.quantityOrdered),
  );
  const anyReceived = allLines.some((l) => parseFloat(l.quantityReceived) > 0);

  if (fullyReceived) {
    await db
      .update(purchaseOrders)
      .set({ status: "received", receivedAt: new Date() })
      .where(eq(purchaseOrders.id, d.purchaseOrderId));
  } else if (anyReceived) {
    await db
      .update(purchaseOrders)
      .set({ status: "partially_received" })
      .where(eq(purchaseOrders.id, d.purchaseOrderId));
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "procurement.order.receive_line",
    entityType: "purchase_order_line",
    entityId: line.id,
    after: {
      receivedQuantity: d.receivedQuantity,
      toLocationId: d.toLocationId,
      movementId: movement.movementId,
    },
  });

  revalidatePath("/dashboard/procurement/orders");
  revalidatePath(`/dashboard/procurement/orders/${d.purchaseOrderId}`);
  return { ok: true };
}

/**
 * Manual override — flip a PO to `received` when all line quantities are
 * already accounted for (e.g. legacy PO closed without per-line receiving).
 */
export async function markPurchaseOrderReceivedAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("procurement.approve");
  const parsed = purchaseOrderIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [before] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "PO not found." };
  if (before.status === "received") return { ok: true };

  await db
    .update(purchaseOrders)
    .set({ status: "received", receivedAt: new Date() })
    .where(eq(purchaseOrders.id, parsed.data.id));

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "procurement.order.mark_received",
    entityType: "purchase_order",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "received" },
  });

  revalidatePath("/dashboard/procurement/orders");
  revalidatePath(`/dashboard/procurement/orders/${parsed.data.id}`);
  return { ok: true };
}
