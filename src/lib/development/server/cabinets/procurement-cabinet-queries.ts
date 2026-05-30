import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

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
    rowsOf<{
        pending: string;
        quotes: string;
        pos_open: string;
        recent_deliveries: string;
      }>(summary)[0] ?? null;

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
      rowsOf<{ output_code: string }>(latest)[0]
        ?.output_code ?? null,
    prsLast7Days:
      rowsOf<{ iso_date: string; count: string }>(prDailyRows).map((r) => ({
        isoDate: r.iso_date,
        count: Number(r.count ?? "0"),
      })) ?? [],
    topPendingPrs:
      rowsOf<{
          id: string;
          request_code: string;
          material_name: string;
          status: string;
          submitted_at: string;
        }>(pendingPrs).map((r) => ({
        id: r.id,
        prCode: r.request_code ?? null,
        title: r.material_name ?? null,
        status: r.status,
        submittedAt: r.submitted_at ?? null,
      })) ?? [],
    spendMtd: (() => {
      const raw = rowsOf<{ spend: string }>(spend)[0]?.spend;
      if (!raw) return null;
      const cents = Number(raw);
      if (!Number.isFinite(cents)) return null;
      return cents / 100;
    })(),
    recentProcurementAnalystOutputs:
      rowsOf<{
          output_code: string;
          title: string;
          summary: string;
          created_at: string;
        }>(recentOutputs).map((r) => ({
        outputCode: r.output_code,
        title: r.title,
        summary: r.summary,
        createdAt: r.created_at,
      })) ?? [],
  };
}

// =============================================================================
// Sprint TASK-7-DATA-PART-1 — Procurement Manager cabinet view readers.
//
// The _handoff/ Procurement cabinet page needs three list-shaped reads
// that the older `loadProcurementCabinet()` snapshot doesn't surface:
//
//   - listOpenPurchaseRequests()    → top open PRs with project/requester
//   - listPosInTransit()            → POs not yet fully delivered
//   - listInvoicesAwaitingApproval() → unsettled invoices nearing/past due
//
// Per DEMO-1 — purchase_requests / POs / invoices weren't seeded for
// the Arconique org, so these are expected to return [] in production
// today. The cabinet page renders friendly empty states instead of
// alarming "0%" KPIs (TASK-7-DATA-PART-1 spec §3).
//
// All queries org-scoped via `requireOrgId()` (TENANT-1).
// =============================================================================

export interface ProcurementPrRow {
  id: string;
  requestCode: string;
  materialName: string;
  projectCode: string | null;
  requesterName: string | null;
  estimatedMinor: number | null;
  currency: string | null;
  urgency: string;
  status: string;
}

export async function listOpenPurchaseRequests(): Promise<ProcurementPrRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    request_code: string;
    material_name: string;
    project_code: string | null;
    requester_name: string | null;
    estimated_minor: string | null;
    currency: string | null;
    urgency: string;
    status: string;
  }>(sql`
    SELECT pr.id::text                          AS id,
           pr.request_code                       AS request_code,
           pr.material_name                      AS material_name,
           p.project_code                        AS project_code,
           u.full_name                           AS requester_name,
           pr.estimated_cost_minor::text         AS estimated_minor,
           pr.estimated_currency                 AS currency,
           pr.urgency                            AS urgency,
           pr.status                             AS status
      FROM dev_os_purchase_requests pr
      LEFT JOIN projects p   ON p.id = pr.project_id
      LEFT JOIN app_users u  ON u.id = pr.requested_by
     WHERE pr.organization_id = ${orgId}
       AND pr.status IN ('draft','submitted','awaiting_approval','approved')
     ORDER BY
       CASE pr.urgency
         WHEN 'critical' THEN 0
         WHEN 'high'     THEN 1
         WHEN 'normal'   THEN 2
         WHEN 'low'      THEN 3
         ELSE 4
       END,
       pr.required_by_date ASC NULLS LAST
     LIMIT 12
  `);
  return (
    rowsOf<{
      id: string;
      request_code: string;
      material_name: string;
      project_code: string | null;
      requester_name: string | null;
      estimated_minor: string | null;
      currency: string | null;
      urgency: string;
      status: string;
    }>(rows)
  ).map((r) => ({
    id: r.id,
    requestCode: r.request_code,
    materialName: r.material_name,
    projectCode: r.project_code,
    requesterName: r.requester_name,
    estimatedMinor: r.estimated_minor ? Number(r.estimated_minor) : null,
    currency: r.currency,
    urgency: r.urgency,
    status: r.status,
  }));
}

export interface ProcurementPoRow {
  id: string;
  poCode: string;
  vendorName: string | null;
  projectCode: string | null;
  expectedDelivery: string | null;
  totalMinor: number | null;
  currency: string | null;
  status: string;
}

export async function listPosInTransit(): Promise<ProcurementPoRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    po_code: string;
    vendor_name: string | null;
    project_code: string | null;
    expected_delivery: string | null;
    total_minor: string | null;
    currency: string | null;
    status: string;
  }>(sql`
    SELECT po.id::text                                                AS id,
           po.po_code                                                  AS po_code,
           v.legal_name                                                AS vendor_name,
           p.project_code                                              AS project_code,
           po.expected_delivery_date::text                             AS expected_delivery,
           po.total_amount_usd_minor::text                             AS total_minor,
           'USD'                                                       AS currency,
           po.status                                                   AS status
      FROM material_purchase_orders po
      LEFT JOIN vendors v  ON v.id = po.vendor_id
      LEFT JOIN projects p ON p.id = po.project_id
     WHERE po.organization_id = ${orgId}
       AND po.status IN ('ordered','partially_delivered')
     ORDER BY po.expected_delivery_date ASC NULLS LAST
     LIMIT 12
  `);
  return (
    rowsOf<{
      id: string;
      po_code: string;
      vendor_name: string | null;
      project_code: string | null;
      expected_delivery: string | null;
      total_minor: string | null;
      currency: string | null;
      status: string;
    }>(rows)
  ).map((r) => ({
    id: r.id,
    poCode: r.po_code,
    vendorName: r.vendor_name,
    projectCode: r.project_code,
    expectedDelivery: r.expected_delivery,
    totalMinor: r.total_minor ? Number(r.total_minor) : null,
    currency: r.currency,
    status: r.status,
  }));
}

export interface ProcurementInvoiceRow {
  id: string;
  invoiceNumber: string;
  vendorName: string | null;
  poCode: string | null;
  totalMinor: number;
  currency: string;
  dueDate: string | null;
  status: string;
  daysToDue: number | null;
}

export async function listInvoicesAwaitingApproval(): Promise<ProcurementInvoiceRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    invoice_number: string;
    vendor_name: string | null;
    po_code: string | null;
    total_minor: string;
    currency: string;
    due_date: string | null;
    status: string;
    days_to_due: string | null;
  }>(sql`
    SELECT i.id::text                                            AS id,
           i.invoice_number                                       AS invoice_number,
           v.legal_name                                           AS vendor_name,
           po.po_code                                             AS po_code,
           i.total_minor::text                                    AS total_minor,
           i.currency                                             AS currency,
           i.due_date::text                                       AS due_date,
           i.status                                               AS status,
           (i.due_date - CURRENT_DATE)::text                      AS days_to_due
      FROM dev_invoices i
      LEFT JOIN vendors v                  ON v.id = i.vendor_id
      LEFT JOIN material_purchase_orders po ON po.id = i.related_po_id
     WHERE i.organization_id = ${orgId}
       AND i.invoice_type = 'payable'
       AND i.status IN ('draft','issued','sent','overdue')
     ORDER BY i.due_date ASC NULLS LAST
     LIMIT 12
  `);
  return (
    rowsOf<{
      id: string;
      invoice_number: string;
      vendor_name: string | null;
      po_code: string | null;
      total_minor: string;
      currency: string;
      due_date: string | null;
      status: string;
      days_to_due: string | null;
    }>(rows)
  ).map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    vendorName: r.vendor_name,
    poCode: r.po_code,
    totalMinor: Number(r.total_minor),
    currency: r.currency,
    dueDate: r.due_date,
    status: r.status,
    daysToDue: r.days_to_due !== null ? Number(r.days_to_due) : null,
  }));
}
