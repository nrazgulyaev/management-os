import "server-only";

import { listLowStockItems } from "@/features/inventory/services";
import { queueNotification } from "@/features/notifications/services";
import { recordAuditEvent } from "@/features/audit/services";
import type { JobOutcome, JobRunHandle } from "./runner";

const LOW_STOCK_TEMPLATE = "low_stock_alert";
const ALERT_ROLE_RECIPIENTS = ["operations_manager", "procurement_manager"];

/**
 * Pure helper — exported for tests so the dedupe contract stays explicit.
 * Format: low_stock_alert:YYYY-MM-DD. One notification per role per day.
 */
export function lowStockDedupeKey(
  roleKey: string,
  now: Date = new Date(),
): string {
  const ymd = now.toISOString().slice(0, 10);
  return `${LOW_STOCK_TEMPLATE}:${roleKey}:${ymd}`;
}

export async function runLowStockScanJob(handle: JobRunHandle): Promise<JobOutcome> {
  const items = await listLowStockItems();
  const lowStockCount = items.length;

  if (lowStockCount === 0) {
    await handle.event("info", "No items below reorder point.");
    return {
      status: "success",
      summary: "No low-stock items.",
      metrics: {
        lowStockCount: 0,
        notificationsQueued: 0,
        deduped: 0,
      },
    };
  }

  // Treat any item that is fully out (quantity = 0) AND has a reorder_point as
  // "critical" — bumps the notification priority for the day.
  const critical = items.filter((i) => i.totalStock <= 0 && i.reorderPoint !== null).length;
  const priority = critical > 0 ? "high" : "normal";

  const payload = {
    items: items.map((i) => ({
      id: i.id,
      sku: i.sku,
      name: i.name,
      totalStock: i.totalStock,
      reorderPoint: i.reorderPoint,
      unit: i.unit,
    })),
    critical,
  };

  let queued = 0;
  let deduped = 0;
  for (const role of ALERT_ROLE_RECIPIENTS) {
    const dedupeKey = lowStockDedupeKey(role);
    const result = await queueNotification({
      recipientType: "role",
      recipientId: undefined,
      channel: "in_app",
      templateKey: LOW_STOCK_TEMPLATE,
      title: "Low stock alert",
      body: `${lowStockCount} inventory item${lowStockCount === 1 ? "" : "s"} at or below reorder point${critical > 0 ? ` · ${critical} out of stock` : ""}.`,
      payload: { ...payload, recipientRole: role },
      priority,
      dedupeKey,
    });
    if (!result) continue;
    if (result.status === "queued") queued++;
    else deduped++;
    await handle.event("info", `Notification ${result.status} for role ${role}`, {
      dedupeKey,
      notificationId: result.notificationId,
    });
  }

  await recordAuditEvent({
    actorUserId: null,
    action: "inventory.low_stock.scan.cron",
    entityType: "notification_queue",
    entityId: handle.id,
    after: { lowStockCount, critical, queued, deduped },
  });

  return {
    status: "success",
    summary: `Found ${lowStockCount} low-stock item(s); queued ${queued}, deduped ${deduped}`,
    metrics: {
      lowStockCount,
      notificationsQueued: queued,
      deduped,
      critical,
    },
  };
}
