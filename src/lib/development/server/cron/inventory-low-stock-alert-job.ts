import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 4.C.1 — Inventory low-stock alert (daily 09:00).
 *
 * Items where any location has quantity_on_hand <= reorder_point.
 * Logs a warning event for each (item, location) pair so procurement
 * can act.
 *
 * Pure read — no DB mutations.
 */
export async function runDevOsInventoryLowStockAlert(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { lowStock: 0 },
      error: "DB unavailable",
    };
  }

  const result = await db.execute<{
    sku: string;
    display_name: string;
    location_code: string;
    quantity_on_hand: string;
    reorder_point: string;
  }>(sql`
    SELECT
      i.sku,
      i.display_name,
      l.location_code,
      b.quantity_on_hand::text,
      i.reorder_point::text
    FROM dev_os_inventory_items i
    JOIN dev_os_inventory_stock_balances b ON b.item_id = i.id
    JOIN dev_os_inventory_locations l ON l.id = b.location_id
    WHERE i.is_active = TRUE
      AND i.reorder_point IS NOT NULL
      AND b.quantity_on_hand <= i.reorder_point
    ORDER BY i.sku, l.location_code
  `);
  const rows =
    rowsOf<Record<string, string>>(result);

  for (const row of rows) {
    const onHand = Number(row.quantity_on_hand);
    const isOOS = onHand <= 0;
    await handle.event(
      isOOS ? "error" : "warning",
      `${isOOS ? "OUT OF STOCK" : "Low stock"}: ${row.sku} at ${row.location_code} — ${row.quantity_on_hand} (reorder ${row.reorder_point})`,
      {
        sku: row.sku,
        locationCode: row.location_code,
        onHand: row.quantity_on_hand,
        reorderPoint: row.reorder_point,
      },
    );
  }

  return {
    status: "success",
    summary: `${rows.length} (item × location) pair(s) at or below reorder point.`,
    metrics: { lowStock: rows.length },
  };
}
