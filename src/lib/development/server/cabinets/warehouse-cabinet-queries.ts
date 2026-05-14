import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface WarehouseCabinetData {
  totalSkuCount: number;
  lowStockItemsCount: number;
  zeroStockItemsCount: number;
  todayMovementsCount: number;
  qaqcLinkedToMaterialsCount: number;
  /** Phase 5 — pending deliveries (POs not yet received). */
  pendingDeliveriesCount: number;
  /** Phase 5 — daily inventory movement counts for the HatchedBarChart (last 7 days). */
  movementsLast7Days: Array<{ isoDate: string; count: number }>;
  /** Phase 5 — most-recent inventory movements for the activity rail. */
  recentMovements: Array<{
    id: string;
    movementType: string;
    itemName: string | null;
    quantity: string;
    movementDate: string;
  }>;
}

export async function loadWarehouseCabinet(): Promise<WarehouseCabinetData> {
  const db = getDb();
  if (!db) {
    return {
      totalSkuCount: 0,
      lowStockItemsCount: 0,
      zeroStockItemsCount: 0,
      todayMovementsCount: 0,
      qaqcLinkedToMaterialsCount: 0,
      pendingDeliveriesCount: 0,
      movementsLast7Days: [],
      recentMovements: [],
    };
  }
  const summary = await db.execute<{
    total_sku: string;
    low: string;
    zero: string;
    today_movements: string;
    qaqc_materials: string;
    pending_deliveries: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM dev_os_inventory_items WHERE is_active = TRUE) AS total_sku,
      (SELECT COUNT(*)::text FROM dev_os_inventory_stock_balances b
         JOIN dev_os_inventory_items i ON i.id = b.item_id
        WHERE b.quantity_on_hand <= COALESCE(i.reorder_point, 0) AND i.is_active = TRUE) AS low,
      (SELECT COUNT(*)::text FROM dev_os_inventory_stock_balances
        WHERE quantity_on_hand = 0) AS zero,
      (SELECT COUNT(*)::text FROM dev_os_inventory_movements
        WHERE movement_date::date = CURRENT_DATE) AS today_movements,
      (SELECT COUNT(*)::text FROM qa_qc_issues
        WHERE related_entity_type = 'material') AS qaqc_materials,
      (SELECT COUNT(*)::text FROM material_purchase_orders
        WHERE status IN ('ordered', 'partially_delivered')) AS pending_deliveries
  `);
  const s =
    (summary as unknown as {
      rows: Array<{
        total_sku: string;
        low: string;
        zero: string;
        today_movements: string;
        qaqc_materials: string;
        pending_deliveries: string;
      }>;
    }).rows?.[0] ?? null;

  const dailyMovements = await db.execute<{
    iso_date: string;
    count: string;
  }>(sql`
    SELECT to_char(movement_date, 'YYYY-MM-DD') AS iso_date,
           COUNT(*)::text AS count
      FROM dev_os_inventory_movements
     WHERE movement_date >= (CURRENT_DATE - INTERVAL '7 days')
     GROUP BY 1
     ORDER BY 1 ASC
  `);

  const recent = await db.execute<{
    id: string;
    movement_type: string;
    item_name: string;
    quantity: string;
    movement_date: string;
  }>(sql`
    SELECT m.id::text, m.movement_type, i.display_name AS item_name,
           m.quantity::text, m.movement_date::text
      FROM dev_os_inventory_movements m
      LEFT JOIN dev_os_inventory_items i ON i.id = m.item_id
     ORDER BY m.movement_date DESC, m.created_at DESC
     LIMIT 8
  `);

  return {
    totalSkuCount: Number(s?.total_sku ?? "0"),
    lowStockItemsCount: Number(s?.low ?? "0"),
    zeroStockItemsCount: Number(s?.zero ?? "0"),
    todayMovementsCount: Number(s?.today_movements ?? "0"),
    qaqcLinkedToMaterialsCount: Number(s?.qaqc_materials ?? "0"),
    pendingDeliveriesCount: Number(s?.pending_deliveries ?? "0"),
    movementsLast7Days:
      (dailyMovements as unknown as {
        rows: Array<{ iso_date: string; count: string }>;
      }).rows?.map((r) => ({
        isoDate: r.iso_date,
        count: Number(r.count ?? "0"),
      })) ?? [],
    recentMovements:
      (recent as unknown as {
        rows: Array<{
          id: string;
          movement_type: string;
          item_name: string;
          quantity: string;
          movement_date: string;
        }>;
      }).rows?.map((r) => ({
        id: r.id,
        movementType: r.movement_type,
        itemName: r.item_name ?? null,
        quantity: r.quantity,
        movementDate: r.movement_date,
      })) ?? [],
  };
}
