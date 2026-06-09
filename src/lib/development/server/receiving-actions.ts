"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { requireInternalUser } from "@/features/auth/permissions";
import { recordAuditEvent } from "@/features/audit/services";
import { materialPurchaseOrders } from "@/lib/db/schema/site-operations";
import {
  materialReceivingHolds,
  RECEIVING_DECISIONS,
} from "@/lib/db/schema/material-receiving-holds";

/**
 * Warehouse receiving decisions. Each call records one QC-hold row
 * against a material PO: the receiver's at-dock decision
 * (accept_partial | wait_back_order | return_whole | escalate_procurement)
 * with the quantities counted + a reason. Internal-only (warehouse) and
 * audit-logged — receiving is a state write on the PO chain.
 *
 * No money moves here (Indonesia rails deferred — manual mark-paid only);
 * quantities are advisory totals so the workbench can show what was
 * accepted vs held without re-driving the delivery-line writes that
 * recordMaterialDelivery already owns.
 */

const decisionSchema = z.object({
  poId: z.string().uuid(),
  deliveryId: z.string().uuid().optional().nullable(),
  decision: z.enum(RECEIVING_DECISIONS),
  quantityAccepted: z.number().min(0).default(0),
  quantityHeld: z.number().min(0).default(0),
  reason: z.string().trim().min(3).max(2000),
});

export async function recordReceivingDecision(
  input: z.input<typeof decisionSchema>,
): Promise<{ id: string; decision: string }> {
  const parsed = decisionSchema.parse(input);
  const me = await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();

  // Verify the PO belongs to this org (defense in depth on top of the
  // tenant-scoped read side).
  const [po] = await db
    .select({ id: materialPurchaseOrders.id, poCode: materialPurchaseOrders.poCode })
    .from(materialPurchaseOrders)
    .where(
      and(
        eq(materialPurchaseOrders.id, parsed.poId),
        eq(materialPurchaseOrders.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!po) throw new Error("Purchase order not found");

  const [row] = await db
    .insert(materialReceivingHolds)
    .values({
      organizationId,
      poId: parsed.poId,
      deliveryId: parsed.deliveryId ?? null,
      decision: parsed.decision,
      status: "open",
      quantityAccepted: parsed.quantityAccepted.toFixed(4),
      quantityHeld: parsed.quantityHeld.toFixed(4),
      reason: parsed.reason,
      decidedBy: me.appUser?.id ?? null,
    })
    .returning({ id: materialReceivingHolds.id });

  await recordAuditEvent({
    actorUserId: me.appUser?.id ?? null,
    action: "material_receiving.decision",
    entityType: "material_receiving_hold",
    entityId: row.id,
    after: {
      organizationId,
      poId: parsed.poId,
      poCode: po.poCode,
      deliveryId: parsed.deliveryId ?? null,
      decision: parsed.decision,
      quantityAccepted: parsed.quantityAccepted.toFixed(4),
      quantityHeld: parsed.quantityHeld.toFixed(4),
      status: "open",
    },
  });

  return { id: row.id, decision: parsed.decision };
}

const resolveSchema = z.object({
  holdId: z.string().uuid(),
  status: z.enum(["resolved", "cancelled"]),
});

export async function resolveReceivingHold(
  input: z.input<typeof resolveSchema>,
): Promise<void> {
  const parsed = resolveSchema.parse(input);
  const me = await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();

  const [before] = await db
    .select({ status: materialReceivingHolds.status })
    .from(materialReceivingHolds)
    .where(
      and(
        eq(materialReceivingHolds.id, parsed.holdId),
        eq(materialReceivingHolds.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) throw new Error("Receiving hold not found");

  await db
    .update(materialReceivingHolds)
    .set({
      status: parsed.status,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(materialReceivingHolds.id, parsed.holdId),
        eq(materialReceivingHolds.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me.appUser?.id ?? null,
    action: "material_receiving.resolve",
    entityType: "material_receiving_hold",
    entityId: parsed.holdId,
    before: { status: before.status },
    after: { status: parsed.status, organizationId },
  });
}
