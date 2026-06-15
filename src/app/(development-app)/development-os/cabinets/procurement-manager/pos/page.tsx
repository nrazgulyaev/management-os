import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  materialPurchaseOrders,
  vendors,
} from "@/lib/db/schema/site-operations";
import { projects } from "@/lib/db/schema/projects";
import {
  MATERIAL_PO_STATUS_LABEL,
  MATERIAL_PO_PAYMENT_STATUS_LABEL,
  materialPoPaymentStatusTone,
  type MaterialPoStatus,
  type MaterialPoPaymentStatus,
} from "@/lib/development/constants/material-constants";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";

/**
 * Procurement — purchase orders list. Real reads against
 * `material_purchase_orders` (was a hardcoded MOCK_POS array before P0
 * procurement-money). Each row links to the PO detail money lifecycle.
 */

export const metadata: Metadata = { title: "Purchase orders · Development OS" };
export const dynamic = "force-dynamic";

function poStatusTone(
  status: string,
): "neutral" | "warning" | "success" | "danger" {
  if (status === "fully_delivered") return "success";
  if (status === "partially_delivered" || status === "ordered") return "warning";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export default async function PoListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/cabinets/procurement-manager">
                Procurement
              </Link>{" "}
              / <span>Purchase orders</span>
            </div>
            <h1>Purchase orders</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              Active + recent POs across every project.
            </p>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to view purchase orders."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      </DevelopmentShell>
    );
  }

  const rows = await db
    .select({
      id: materialPurchaseOrders.id,
      poCode: materialPurchaseOrders.poCode,
      status: materialPurchaseOrders.status,
      paymentStatus: materialPurchaseOrders.paymentStatus,
      totalAmountUsdMinor: materialPurchaseOrders.totalAmountUsdMinor,
      paidAmountUsdMinor: materialPurchaseOrders.paidAmountUsdMinor,
      orderDate: materialPurchaseOrders.orderDate,
      vendorName: vendors.legalName,
      projectName: projects.name,
    })
    .from(materialPurchaseOrders)
    .leftJoin(vendors, eq(vendors.id, materialPurchaseOrders.vendorId))
    .leftJoin(projects, eq(projects.id, materialPurchaseOrders.projectId))
    .orderBy(desc(materialPurchaseOrders.orderDate));

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/cabinets/procurement-manager">
              Procurement
            </Link>{" "}
            / <span>Purchase orders · {rows.length}</span>
          </div>
          <h1>Purchase orders</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Active + recent POs across every project. Click a row for the
            procure-to-pay money lifecycle.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/cabinets/procurement-manager"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Procurement cabinet
          </Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="No purchase orders"
          description="Purchase orders raised against vendors will appear here."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Ref</TH>
              <TH>Vendor</TH>
              <TH>Project</TH>
              <TH>Total (USD)</TH>
              <TH>Paid (USD)</TH>
              <TH>Status</TH>
              <TH>Payment</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((p) => (
              <TR key={p.id}>
                <TD className="font-mono text-xs">
                  <Link
                    href={`/development-os/cabinets/procurement-manager/pos/${p.id}`}
                    className="hover:underline"
                  >
                    {p.poCode}
                  </Link>
                </TD>
                <TD className="text-xs">{p.vendorName ?? "—"}</TD>
                <TD className="text-xs text-ink-secondary">
                  {p.projectName ?? "—"}
                </TD>
                <TDNum>{formatUsdMinor(BigInt(p.totalAmountUsdMinor))}</TDNum>
                <TDNum>{formatUsdMinor(BigInt(p.paidAmountUsdMinor))}</TDNum>
                <TD>
                  <Badge tone={poStatusTone(p.status)}>
                    {MATERIAL_PO_STATUS_LABEL[p.status as MaterialPoStatus] ??
                      p.status}
                  </Badge>
                </TD>
                <TD>
                  <Badge tone={materialPoPaymentStatusTone(p.paymentStatus)}>
                    {MATERIAL_PO_PAYMENT_STATUS_LABEL[
                      p.paymentStatus as MaterialPoPaymentStatus
                    ] ?? p.paymentStatus}
                  </Badge>
                </TD>
                <TD>
                  <Link
                    href={`/development-os/cabinets/procurement-manager/pos/${p.id}`}
                    className="text-xs text-accent hover:underline"
                  >
                    Open →
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </DevelopmentShell>
  );
}
