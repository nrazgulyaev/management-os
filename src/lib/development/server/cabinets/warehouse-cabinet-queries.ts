import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface WarehouseCabinetData {
  totalSkuCount: number;
  lowStockItemsCount: number;
  zeroStockItemsCount: number;
  todayMovementsCount: number;
  qaqcLinkedToMaterialsCount: number;
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
    };
  }
  const summary = await db.execute<{
    total_sku: string;
    low: string;
    zero: string;
    today_movements: string;
    qaqc_materials: string;
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
        WHERE related_entity_type = 'material') AS qaqc_materials
  `);
  const s =
    (summary as unknown as {
      rows: Array<{
        total_sku: string;
        low: string;
        zero: string;
        today_movements: string;
        qaqc_materials: string;
      }>;
    }).rows?.[0] ?? null;

  return {
    totalSkuCount: Number(s?.total_sku ?? "0"),
    lowStockItemsCount: Number(s?.low ?? "0"),
    zeroStockItemsCount: Number(s?.zero ?? "0"),
    todayMovementsCount: Number(s?.today_movements ?? "0"),
    qaqcLinkedToMaterialsCount: Number(s?.qaqc_materials ?? "0"),
  };
}
