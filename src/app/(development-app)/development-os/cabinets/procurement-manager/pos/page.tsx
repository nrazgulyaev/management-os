import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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

const BREADCRUMBS = [
  { label: "Development OS", href: "/development-os" },
  {
    label: "Procurement",
    href: "/development-os/cabinets/procurement-manager",
  },
  { label: "Purchase orders" },
];

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
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title="Purchase orders"
          description="Active + recent POs across every project."
        />
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
      <PageHeader
        breadcrumbs={BREADCRUMBS}
        eyebrow={`${rows.length} purchase orders`}
        title="Purchase orders"
        description="Active + recent POs across every project. Click a row for the procure-to-pay money lifecycle."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/cabinets/procurement-manager">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Procurement cabinet
            </Link>
          </Button>
        }
      />
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
