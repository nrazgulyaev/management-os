import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PurchaseOrderStatusPill } from "@/components/procurement/purchase-status-pill";
import { listPurchaseOrders } from "@/features/procurement/services";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Purchase orders" };
export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  const rows = await listPurchaseOrders();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Procurement", href: "/dashboard/procurement" },
          { label: "Orders" },
        ]}
        title="Purchase orders"
        description="Sent → confirmed → partially received → received."
        actions={
          <Button asChild>
            <Link href="/dashboard/procurement/orders/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New PO
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No purchase orders yet.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>PO</TH><TH>Supplier</TH><TH>Project</TH><TH>Status</TH>
              <TH>Lines</TH><TH>Expected</TH><TH>Total</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((o) => (
              <TR key={o.id}>
                <TD className="font-mono text-xs">
                  <Link href={`/dashboard/procurement/orders/${o.id}`} className="hover:underline">
                    {o.poCode}
                  </Link>
                </TD>
                <TD>{o.supplierName ?? "—"}</TD>
                <TD className="text-xs">{o.projectName ?? "—"}</TD>
                <TD><PurchaseOrderStatusPill status={o.status} /></TD>
                <TD className="text-xs">{o.lineCount}</TD>
                <TD className="text-xs">{o.expectedDelivery ?? "—"}</TD>
                <TD className="text-xs font-mono">
                  {o.totalMinor !== null && o.currency ? formatMoneyMinor(o.totalMinor, o.currency) : "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
