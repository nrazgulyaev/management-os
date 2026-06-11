import "server-only";

import { getDb } from "@/lib/db/client";

import { listLowStockItems } from "@/features/inventory/services";
import { queueNotification } from "@/features/notifications/services";
import { recordAuditEvent } from "@/features/audit/services";
import { LOW_STOCK_TEMPLATE_KEY, lowStockDedupeKey } from "./dedupe";
import type { JobOutcome, JobRunHandle } from "./runner";

const LOW_STOCK_TEMPLATE = LOW_STOCK_TEMPLATE_KEY;
const ALERT_ROLE_RECIPIENTS = ["operations_manager", "procurement_manager"];

// Re-export the pure helper so callers that already import from this module
// keep working.
export { lowStockDedupeKey };

export async function runLowStockScanJob(handle: JobRunHandle): Promise<JobOutcome> {
  if (!getDb()) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { lowStockCount: 0, notificationsQueued: 0, deduped: 0 },
      error: "DB unavailable",
    };
  }
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
      // org not derivable: cron scan aggregates low-stock items across ALL orgs into one digest per role (listLowStockItems is unscoped)
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
