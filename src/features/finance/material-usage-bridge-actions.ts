"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { taskMaterialUsage } from "@/lib/db/schema/inventory";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { createExpenseFromTaskMaterialUsage } from "./material-usage-bridge";
import type { ActionResult } from "@/features/projects/actions";

const taskIdSchema = z.object({ taskId: z.string().uuid() });
const usageIdSchema = z.object({ usageId: z.string().uuid() });

/**
 * Bridge every pending usage row into expense_lines. Bound to a sane batch
 * cap to avoid rate-limit headaches.
 */
export async function bridgePendingMaterialUsageAction(): Promise<
  ActionResult & { created?: number; skipped?: number; failed?: number }
> {
  await requirePermission("finance.bridge_material_usage");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const pending = await db
    .select({ id: taskMaterialUsage.id })
    .from(taskMaterialUsage)
    .where(eq(taskMaterialUsage.financeBridgeStatus, "pending"))
    .limit(200);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of pending) {
    const result = await createExpenseFromTaskMaterialUsage(row.id, me?.id ?? null);
    if (result.status === "created") created++;
    else if (result.status === "failed") failed++;
    else skipped++;
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "finance.bridge.run",
    entityType: "task_material_usage",
    entityId: null,
    after: { count: pending.length, created, skipped, failed },
  });

  revalidatePath("/dashboard/finance/material-usage");
  revalidatePath("/dashboard/finance/expenses");
  return { ok: true, created, skipped, failed };
}

export async function bridgeMaterialUsageForTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.bridge_material_usage");
  const parsed = taskIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing taskId." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const usages = await db
    .select({ id: taskMaterialUsage.id })
    .from(taskMaterialUsage)
    .where(
      and(
        eq(taskMaterialUsage.taskId, parsed.data.taskId),
        eq(taskMaterialUsage.financeBridgeStatus, "pending"),
      ),
    );
  for (const u of usages) {
    await createExpenseFromTaskMaterialUsage(u.id, me?.id ?? null);
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "finance.bridge.for_task",
    entityType: "operation_task",
    entityId: parsed.data.taskId,
    after: { count: usages.length },
  });

  revalidatePath(`/dashboard/operations/tasks/${parsed.data.taskId}`);
  revalidatePath("/dashboard/finance/material-usage");
  return { ok: true };
}

export async function bridgeOneMaterialUsageAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.bridge_material_usage");
  const parsed = usageIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing usageId." };
  const me = await getCurrentAppUser();
  const result = await createExpenseFromTaskMaterialUsage(parsed.data.usageId, me?.id ?? null);
  if (result.status === "failed") {
    return { ok: false, error: result.reason ?? "Bridge failed" };
  }
  revalidatePath("/dashboard/finance/material-usage");
  return { ok: true };
}
