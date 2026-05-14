import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface ProcurementCabinetData {
  pendingApprovalsCount: number;
  quotationsAwaitingComparisonCount: number;
  posAwaitingDeliveryCount: number;
  recentDeliveriesCount: number;
  latestProcurementAnalystOutputCode: string | null;
  /**
   * Phase 3 — daily PR submission counts for the last 7 calendar days.
   * Drives the HatchedBarChart on the cabinet apex.
   */
  prsLast7Days: Array<{ isoDate: string; count: number }>;
  /**
   * Phase 3 — top pending purchase requests for the side rail
   * (recent submissions awaiting approval / quotation).
   */
  topPendingPrs: Array<{
    id: string;
    prCode: string | null;
    title: string | null;
    status: string;
    submittedAt: string | null;
  }>;
  /**
   * Phase 3 — spend MTD in the system's reporting currency.
   * Sum of (line_qty × line_unit_price) on POs created this month.
   * Null when no POs exist this month.
   */
  spendMtd: number | null;
  /**
   * Phase 3 — three most-recent procurement-analyst outputs for the
   * inline AI insight grid (CFO recipe).
   */
  recentProcurementAnalystOutputs: Array<{
    outputCode: string;
    title: string;
    summary: string;
    createdAt: string;
  }>;
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
      prsLast7Days: [],
      topPendingPrs: [],
      spendMtd: null,
      recentProcurementAnalystOutputs: [],
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

  const recentOutputs = await db.execute<{
    output_code: string;
    title: string;
    summary: string;
    created_at: string;
  }>(sql`
    SELECT output_code, title, summary, created_at::text
      FROM agent_outputs
     WHERE agent_key = 'procurement_analyst'
     ORDER BY created_at DESC LIMIT 3
  `);

  const prDailyRows = await db.execute<{
    iso_date: string;
    count: string;
  }>(sql`
    SELECT to_char(date_trunc('day', submitted_at), 'YYYY-MM-DD') AS iso_date,
           COUNT(*)::text AS count
      FROM dev_os_purchase_requests
     WHERE submitted_at >= (now() - INTERVAL '7 days')
     GROUP BY 1
     ORDER BY 1 ASC
  `);

  const pendingPrs = await db.execute<{
    id: string;
    request_code: string;
    material_name: string;
    status: string;
    submitted_at: string;
  }>(sql`
    SELECT id::text, request_code, material_name, status,
           submitted_at::text
      FROM dev_os_purchase_requests
     WHERE status IN ('submitted', 'awaiting_approval')
     ORDER BY submitted_at DESC NULLS LAST
     LIMIT 5
  `);

  const spend = await db.execute<{ spend: string }>(sql`
    SELECT COALESCE(SUM(total_amount_usd_minor), 0)::text AS spend
      FROM material_purchase_orders
     WHERE order_date >= date_trunc('month', now())::date
  `);

  return {
    pendingApprovalsCount: Number(s?.pending ?? "0"),
    quotationsAwaitingComparisonCount: Number(s?.quotes ?? "0"),
    posAwaitingDeliveryCount: Number(s?.pos_open ?? "0"),
    recentDeliveriesCount: Number(s?.recent_deliveries ?? "0"),
    latestProcurementAnalystOutputCode:
      (latest as unknown as { rows: Array<{ output_code: string }> }).rows?.[0]
        ?.output_code ?? null,
    prsLast7Days:
      (prDailyRows as unknown as {
        rows: Array<{ iso_date: string; count: string }>;
      }).rows?.map((r) => ({
        isoDate: r.iso_date,
        count: Number(r.count ?? "0"),
      })) ?? [],
    topPendingPrs:
      (pendingPrs as unknown as {
        rows: Array<{
          id: string;
          request_code: string;
          material_name: string;
          status: string;
          submitted_at: string;
        }>;
      }).rows?.map((r) => ({
        id: r.id,
        prCode: r.request_code ?? null,
        title: r.material_name ?? null,
        status: r.status,
        submittedAt: r.submitted_at ?? null,
      })) ?? [],
    spendMtd: (() => {
      const raw = (spend as unknown as { rows: Array<{ spend: string }> })
        .rows?.[0]?.spend;
      if (!raw) return null;
      const cents = Number(raw);
      if (!Number.isFinite(cents)) return null;
      return cents / 100;
    })(),
    recentProcurementAnalystOutputs:
      (recentOutputs as unknown as {
        rows: Array<{
          output_code: string;
          title: string;
          summary: string;
          created_at: string;
        }>;
      }).rows?.map((r) => ({
        outputCode: r.output_code,
        title: r.title,
        summary: r.summary,
        createdAt: r.created_at,
      })) ?? [],
  };
}
