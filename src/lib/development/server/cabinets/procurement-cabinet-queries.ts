import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface ProcurementCabinetData {
  pendingApprovalsCount: number;
  quotationsAwaitingComparisonCount: number;
  posAwaitingDeliveryCount: number;
  recentDeliveriesCount: number;
  latestProcurementAnalystOutputCode: string | null;
}

export async function loadProcurementCabinet(): Promise<ProcurementCabinetData> {
  const db = getDb();
  if (!db) {
    return {
      pendingApprovalsCount: 0,
      quotationsAwaitingComparisonCount: 0,
      posAwaitingDeliveryCount: 0,
      recentDeliveriesCount: 0,
      latestProcurementAnalystOutputCode: null,
    };
  }
  const summary = await db.execute<{
    pending: string;
    quotes: string;
    pos_open: string;
    recent_deliveries: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM dev_os_purchase_requests
        WHERE status IN ('submitted', 'awaiting_approval')) AS pending,
      (SELECT COUNT(*)::text FROM procurement_quotations
        WHERE status = 'pending_comparison') AS quotes,
      (SELECT COUNT(*)::text FROM material_purchase_orders
        WHERE status NOT IN ('completed', 'cancelled')) AS pos_open,
      (SELECT COUNT(*)::text FROM material_deliveries
        WHERE actual_delivery_date >= CURRENT_DATE - INTERVAL '7 days') AS recent_deliveries
  `);
  const s =
    (summary as unknown as {
      rows: Array<{
        pending: string;
        quotes: string;
        pos_open: string;
        recent_deliveries: string;
      }>;
    }).rows?.[0] ?? null;

  const latest = await db.execute<{ output_code: string }>(sql`
    SELECT output_code FROM agent_outputs
     WHERE agent_key = 'procurement_analyst'
     ORDER BY created_at DESC LIMIT 1
  `);

  return {
    pendingApprovalsCount: Number(s?.pending ?? "0"),
    quotationsAwaitingComparisonCount: Number(s?.quotes ?? "0"),
    posAwaitingDeliveryCount: Number(s?.pos_open ?? "0"),
    recentDeliveriesCount: Number(s?.recent_deliveries ?? "0"),
    latestProcurementAnalystOutputCode:
      (latest as unknown as { rows: Array<{ output_code: string }> }).rows?.[0]
        ?.output_code ?? null,
  };
}
