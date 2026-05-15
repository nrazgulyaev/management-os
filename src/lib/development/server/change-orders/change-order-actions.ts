"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { changeOrders } from "@/lib/db/schema/project-memory";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  lookupRequiredApproval,
  type ApprovalThresholdRow,
} from "../procurement/approval-helpers";

const INITIATION_TYPES = [
  "arconique_internal",
  "buyer_request",
  "investor_request",
  "vendor_proposed",
  "regulatory",
  "design_correction",
  "site_condition",
] as const;

const STATUSES = [
  "requested",
  "under_review",
  "approved",
  "in_progress",
  "completed",
  "rejected",
  "cancelled",
] as const;

const VALID_NEXT: Record<string, string[]> = {
  requested: ["under_review", "approved", "rejected", "cancelled"],
  under_review: ["approved", "rejected", "cancelled"],
  approved: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
};

const createSchema = z.object({
  title: z.string().min(1),
  projectId: z.string().uuid(),
  villaId: z.string().uuid().nullable().optional(),
  workPackageId: z.string().uuid().nullable().optional(),
  initiatedByType: z.enum(INITIATION_TYPES),
  reason: z.string().min(1),
  scopeChangeDescription: z.string().min(1),
  costImpactMinor: z.bigint().default(0n),
  costImpactCurrency: z.string().default("IDR"),
  scheduleImpactDays: z.number().int().default(0),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
});

export async function createChangeOrder(input: z.input<typeof createSchema>) {
  const ctx = await requireInternalUser();
  const parsed = createSchema.parse(input);
  const db = requireDb();
  // HF-5: change_orders is multi-tenant — scope insert by org.
  const organizationId = await requireOrgId();
  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(changeOrders);
  const year = new Date().getFullYear();
  const seq = String(Number(count ?? "0") + 1).padStart(3, "0");
  const changeOrderCode = `CO-${parsed.projectId.slice(0, 8)}-${year}-${seq}`;
  const [row] = await db
    .insert(changeOrders)
    .values({
      organizationId,
      changeOrderCode,
      title: parsed.title,
      projectId: parsed.projectId,
      villaId: parsed.villaId ?? null,
      workPackageId: parsed.workPackageId ?? null,
      initiatedByType: parsed.initiatedByType,
      initiatedByUserId: ctx.appUser?.id ?? null,
      requestedAt: new Date().toISOString().slice(0, 10),
      reason: parsed.reason,
      scopeChangeDescription: parsed.scopeChangeDescription,
      costImpactMinor: parsed.costImpactMinor,
      costImpactCurrency: parsed.costImpactCurrency,
      scheduleImpactDays: parsed.scheduleImpactDays,
      notes: parsed.notes ?? null,
      internalNotes: parsed.internalNotes ?? null,
    })
    .returning();
  return row;
}

const transitionSchema = z.object({
  changeOrderId: z.string().uuid(),
  to: z.enum(STATUSES),
  approvalNotes: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
});

export async function transitionChangeOrder(
  input: z.input<typeof transitionSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();
  // HF-5: scope SELECT + UPDATE by organization_id.
  const organizationId = await requireOrgId();
  const [current] = await db
    .select()
    .from(changeOrders)
    .where(
      and(
        eq(changeOrders.id, parsed.changeOrderId),
        eq(changeOrders.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!current) throw new Error("change_order not found");
  if (!VALID_NEXT[current.status].includes(parsed.to)) {
    throw new Error(
      `cannot transition change_order from '${current.status}' to '${parsed.to}'`,
    );
  }
  const updates: Record<string, unknown> = {
    status: parsed.to,
    statusChangedAt: new Date(),
  };
  if (parsed.to === "approved") {
    updates.approvedBy = ctx.appUser?.id ?? null;
    updates.approvedAt = new Date();
    if (parsed.approvalNotes) updates.approvalNotes = parsed.approvalNotes;
  }
  if (parsed.to === "rejected") {
    updates.rejectionReason = parsed.rejectionReason ?? null;
  }
  const [row] = await db
    .update(changeOrders)
    .set(updates)
    .where(
      and(
        eq(changeOrders.id, parsed.changeOrderId),
        eq(changeOrders.organizationId, organizationId),
      ),
    )
    .returning();
  return row;
}

/**
 * Look up the approval threshold for a change_order based on its
 * cost_impact_minor. Reuses the approval_thresholds matrix established
 * in Stage 4.A. Returns the role required to approve.
 */
export async function lookupChangeOrderApproval(input: {
  changeOrderId: string;
  thresholds: ApprovalThresholdRow[];
}) {
  const db = requireDb();
  const [co] = await db
    .select()
    .from(changeOrders)
    .where(eq(changeOrders.id, input.changeOrderId))
    .limit(1);
  if (!co) throw new Error("change_order not found");
  // Use absolute cost impact for threshold lookup (downgrades still need approval).
  const cost = co.costImpactMinor;
  const absCost = cost < 0n ? -cost : cost;
  return lookupRequiredApproval({
    thresholds: input.thresholds,
    thresholdType: "change_order",
    amountMinor: absCost,
    currency: co.costImpactCurrency ?? "IDR",
  });
}
