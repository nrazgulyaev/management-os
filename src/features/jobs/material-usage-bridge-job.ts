import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { taskMaterialUsage } from "@/lib/db/schema/inventory";
import { createExpenseFromTaskMaterialUsage } from "@/features/finance/material-usage-bridge";
import { recordAuditEvent } from "@/features/audit/services";
import type { JobOutcome, JobRunHandle } from "./runner";

const BATCH_LIMIT = 200;

export async function runMaterialUsageFinanceBridgeJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { usageChecked: 0 },
      error: "DB unavailable",
    };
  }

  const pending = await db
    .select({ id: taskMaterialUsage.id })
    .from(taskMaterialUsage)
    .where(eq(taskMaterialUsage.financeBridgeStatus, "pending"))
    .limit(BATCH_LIMIT);

  let expensesCreated = 0;
  let skippedLocked = 0;
  let skippedNotChargeable = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      const result = await createExpenseFromTaskMaterialUsage(row.id, null);
      switch (result.status) {
        case "created":
          expensesCreated++;
          break;
        case "skipped_locked_period":
          skippedLocked++;
          break;
        case "skipped_not_chargeable":
          skippedNotChargeable++;
          break;
        case "failed":
          failed++;
          await handle.event("warning", `Bridge failed for usage ${row.id}: ${result.reason ?? "unknown"}`, {
            usageId: row.id,
          });
          break;
      }
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : "unknown error";
      await handle.event("error", `Bridge threw for usage ${row.id}: ${message}`, {
        usageId: row.id,
      });
    }
  }

  await recordAuditEvent({
    actorUserId: null,
    action: "finance.bridge.cron",
    entityType: "task_material_usage",
    entityId: handle.id,
    after: {
      checked: pending.length,
      created: expensesCreated,
      skippedLocked,
      skippedNotChargeable,
      failed,
    },
  });

  const status =
    failed > 0 && expensesCreated > 0
      ? "partial_success"
      : failed > 0 && expensesCreated === 0 && skippedLocked === 0 && skippedNotChargeable === 0
        ? "failed"
        : "success";

  return {
    status,
    summary: `Checked ${pending.length} · created ${expensesCreated} · locked ${skippedLocked} · not chargeable ${skippedNotChargeable} · failed ${failed}`,
    metrics: {
      usageChecked: pending.length,
      expensesCreated,
      skippedLocked,
      skippedNotChargeable,
      failed,
    },
    error: failed > 0 ? `${failed} usage row(s) failed` : undefined,
  };
}
