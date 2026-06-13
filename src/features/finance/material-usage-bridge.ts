import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { taskMaterialUsage, inventoryItems, inventoryCategories } from "@/lib/db/schema/inventory";
import { operationTasks } from "@/lib/db/schema/operations";
import { expenseLines } from "@/lib/db/schema/finance";
import { financeMaterialUsageLinks } from "@/lib/db/schema/integrations";
import { findLockingPeriod } from "./validation";
import type { WithSource } from "@/features/types";
// Pure helpers (computeBridgeAmount, mapItemToExpenseType, BridgeStatus)
// live in `material-usage-bridge-pure.ts` so tests can import them without
// dragging in `server-only`. Re-export here for callers.
import {
  computeBridgeAmount,
  mapItemToExpenseType,
  type BridgeAttemptInput,
  type BridgeAmountResult,
  type BridgeStatus,
} from "./material-usage-bridge-pure";
export { computeBridgeAmount, mapItemToExpenseType };
export type { BridgeAttemptInput, BridgeAmountResult, BridgeStatus };

// -----------------------------------------------------------------------------
// Read paths
// -----------------------------------------------------------------------------

export interface MaterialUsageBridgeRow {
  id: string; // link id
  usageId: string;
  taskId: string;
  taskCode: string | null;
  itemId: string;
  itemName: string;
  itemUnit: string;
  quantity: number;
  unitCostMinor: bigint | null;
  currency: string | null;
  villaId: string | null;
  villaCode: string | null;
  ownerChargeable: boolean;
  status: string;
  expenseLineId: string | null;
  reason: string | null;
  createdAt: string;
}

export async function listMaterialUsageFinanceLinks(opts?: {
  status?: string;
  limit?: number;
}): Promise<WithSource<MaterialUsageBridgeRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — finance_material_usage_links carries organization_id.
  const organizationId = await requireOrgId();

  const rows = await db
    .select({
      l: financeMaterialUsageLinks,
      u: taskMaterialUsage,
      task: operationTasks,
      item: inventoryItems,
    })
    .from(financeMaterialUsageLinks)
    .innerJoin(
      taskMaterialUsage,
      eq(taskMaterialUsage.id, financeMaterialUsageLinks.taskMaterialUsageId),
    )
    .innerJoin(operationTasks, eq(operationTasks.id, taskMaterialUsage.taskId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, taskMaterialUsage.itemId))
    .where(
      and(
        eq(financeMaterialUsageLinks.organizationId, organizationId),
        opts?.status ? eq(financeMaterialUsageLinks.status, opts.status) : undefined,
      ),
    )
    .orderBy(desc(financeMaterialUsageLinks.createdAt))
    .limit(opts?.limit ?? 200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.l.id,
    usageId: r.u.id,
    taskId: r.u.taskId,
    taskCode: r.task.taskCode,
    itemId: r.u.itemId,
    itemName: r.item.name,
    itemUnit: r.item.unit,
    quantity:
      typeof r.u.quantity === "string" ? parseFloat(r.u.quantity) : Number(r.u.quantity),
    unitCostMinor: r.u.unitCostMinor,
    currency: r.u.currency,
    villaId: r.task.villaId,
    villaCode: null,
    ownerChargeable: r.l.ownerChargeable,
    status: r.l.status,
    expenseLineId: r.l.expenseLineId,
    reason: r.l.reason,
    createdAt: r.l.createdAt.toISOString(),
  }));
}

export async function getBridgeStatusForUsage(usageId: string): Promise<BridgeStatus | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ status: financeMaterialUsageLinks.status })
    .from(financeMaterialUsageLinks)
    .where(eq(financeMaterialUsageLinks.taskMaterialUsageId, usageId))
    .limit(1);
  return (row?.status as BridgeStatus | undefined) ?? null;
}

// -----------------------------------------------------------------------------
// Core bridge: turn one usage row into a posted expense_line.
// -----------------------------------------------------------------------------

export interface BridgeCreateResult {
  status: BridgeStatus;
  linkId?: string;
  expenseLineId?: string;
  reason?: string;
}

/**
 * Attempt to create an expense_line for a single task_material_usage row.
 * Idempotent — repeated calls for the same usage return the existing link.
 */
export async function createExpenseFromTaskMaterialUsage(
  usageId: string,
  actorUserId: string | null = null,
): Promise<BridgeCreateResult> {
  const db = getDb();
  if (!db) return { status: "failed", reason: "DB unavailable" };

  // Already linked?
  const [existingLink] = await db
    .select()
    .from(financeMaterialUsageLinks)
    .where(eq(financeMaterialUsageLinks.taskMaterialUsageId, usageId))
    .limit(1);
  if (existingLink) {
    if (existingLink.status === "created" && existingLink.expenseLineId) {
      return {
        status: "created",
        linkId: existingLink.id,
        expenseLineId: existingLink.expenseLineId,
        reason: "already linked",
      };
    }
    // Other terminal states stay sticky — caller can manually retry by
    // marking the link as `pending` (out of scope for v6).
    if (
      existingLink.status === "skipped_locked_period" ||
      existingLink.status === "skipped_not_chargeable" ||
      existingLink.status === "failed"
    ) {
      return {
        status: existingLink.status as BridgeStatus,
        linkId: existingLink.id,
        reason: existingLink.reason ?? undefined,
      };
    }
  }

  const [usage] = await db
    .select()
    .from(taskMaterialUsage)
    .where(eq(taskMaterialUsage.id, usageId))
    .limit(1);
  if (!usage) return { status: "failed", reason: "usage row not found" };

  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, usage.itemId))
    .limit(1);
  if (!item) return { status: "failed", reason: "item row not found" };

  const [category] = item.categoryId
    ? await db
        .select()
        .from(inventoryCategories)
        .where(eq(inventoryCategories.id, item.categoryId))
        .limit(1)
    : [undefined];

  const [task] = await db
    .select()
    .from(operationTasks)
    .where(eq(operationTasks.id, usage.taskId))
    .limit(1);
  if (!task) return { status: "failed", reason: "task row not found" };

  const ownerChargeable = usage.ownerChargeable && item.ownerChargeable;
  if (!ownerChargeable) {
    return upsertLink(usageId, {
      status: "skipped_not_chargeable",
      ownerChargeable: false,
      reason: "neither usage nor item flagged owner_chargeable",
      taskInfo: { villaId: task.villaId, projectId: task.projectId, bookingId: task.bookingId },
      movementId: usage.movementId,
      actorUserId,
    });
  }

  const quantityNum =
    typeof usage.quantity === "string" ? parseFloat(usage.quantity) : Number(usage.quantity);
  const amount = computeBridgeAmount({
    ownerChargeableUsage: usage.ownerChargeable,
    ownerChargeableItem: item.ownerChargeable,
    unitCostMinor: usage.unitCostMinor ?? item.unitCostMinor ?? null,
    quantity: quantityNum,
    currency: usage.currency ?? item.currency ?? null,
  });
  if (!amount) {
    return upsertLink(usageId, {
      status: "failed",
      ownerChargeable,
      reason: "missing unit cost or currency on usage/item",
      taskInfo: { villaId: task.villaId, projectId: task.projectId, bookingId: task.bookingId },
      movementId: usage.movementId,
      actorUserId,
    });
  }

  // Period-lock check: refuse to insert into a closed/locked period.
  const expenseDate = (task.completedAt ?? new Date()).toISOString().slice(0, 10);
  const lock = await findLockingPeriod(db, expenseDate);
  if (lock) {
    return upsertLink(usageId, {
      status: "skipped_locked_period",
      ownerChargeable,
      reason: `period "${lock.label}" is ${lock.status}`,
      taskInfo: { villaId: task.villaId, projectId: task.projectId, bookingId: task.bookingId },
      movementId: usage.movementId,
      actorUserId,
    });
  }

  const expenseType = mapItemToExpenseType(item.itemType, category?.key ?? null);
  const description = `Material usage · ${item.name} · ${quantityNum} ${item.unit} · ${task.taskCode}`;

  const [expense] = await db
    .insert(expenseLines)
    .values({
      villaId: task.villaId,
      projectId: task.projectId,
      bookingId: task.bookingId,
      expenseType,
      description,
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      expenseDate,
      allocationScope: task.villaId ? "villa" : "project_pool",
      capitalized: false,
      ownerChargeable,
      status: "posted",
      createdBy: actorUserId,
    })
    .returning({ id: expenseLines.id });

  const [link] = await db
    .insert(financeMaterialUsageLinks)
    .values({
      taskMaterialUsageId: usageId,
      inventoryMovementId: usage.movementId,
      expenseLineId: expense.id,
      bookingId: task.bookingId,
      villaId: task.villaId,
      projectId: task.projectId,
      ownerChargeable: true,
      status: "created",
      createdBy: actorUserId,
    })
    .onConflictDoUpdate({
      target: financeMaterialUsageLinks.taskMaterialUsageId,
      set: {
        expenseLineId: expense.id,
        status: "created",
        reason: null,
      },
    })
    .returning({ id: financeMaterialUsageLinks.id });

  // Denormalised pointers on the usage row.
  await db
    .update(taskMaterialUsage)
    .set({ financeBridgeStatus: "created", expenseLineId: expense.id })
    .where(eq(taskMaterialUsage.id, usageId));

  return { status: "created", linkId: link.id, expenseLineId: expense.id };
}

interface UpsertLinkArgs {
  status: BridgeStatus;
  ownerChargeable: boolean;
  reason: string | null;
  taskInfo: {
    villaId: string | null;
    projectId: string | null;
    bookingId: string | null;
  };
  movementId: string | null;
  actorUserId: string | null;
}

async function upsertLink(usageId: string, args: UpsertLinkArgs): Promise<BridgeCreateResult> {
  const db = getDb();
  if (!db) return { status: "failed", reason: "DB unavailable" };
  const [link] = await db
    .insert(financeMaterialUsageLinks)
    .values({
      taskMaterialUsageId: usageId,
      inventoryMovementId: args.movementId,
      villaId: args.taskInfo.villaId,
      projectId: args.taskInfo.projectId,
      bookingId: args.taskInfo.bookingId,
      ownerChargeable: args.ownerChargeable,
      status: args.status,
      reason: args.reason,
      createdBy: args.actorUserId,
    })
    .onConflictDoUpdate({
      target: financeMaterialUsageLinks.taskMaterialUsageId,
      set: {
        status: args.status,
        reason: args.reason,
        ownerChargeable: args.ownerChargeable,
      },
    })
    .returning({ id: financeMaterialUsageLinks.id });
  await db
    .update(taskMaterialUsage)
    .set({ financeBridgeStatus: args.status })
    .where(eq(taskMaterialUsage.id, usageId));
  return { status: args.status, linkId: link.id, reason: args.reason ?? undefined };
}
