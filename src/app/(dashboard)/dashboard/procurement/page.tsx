import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Plus, ListPlus, FileText } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { RequestCard } from "@/components/procurement/request-card";
import { PurchaseOrderStatusPill } from "@/components/procurement/purchase-status-pill";
import {
  listPurchaseOrders,
  listPurchaseRequests,
} from "@/features/procurement/services";

export const metadata = { title: "Procurement" };
export const dynamic = "force-dynamic";

export default async function ProcurementHomePage() {
  const [requests, orders] = await Promise.all([
    listPurchaseRequests(),
    listPurchaseOrders(),
  ]);

  const pending = requests.filter((r) => r.status === "submitted").length;
  const draft = requests.filter((r) => r.status === "draft").length;
  const openOrders = orders.filter(
    (o) => !["received", "cancelled"].includes(o.status),
  ).length;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Procurement" }]}
        title="Procurement"
        description="Purchase requests, purchase orders, and supplier coordination."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href="/dashboard/procurement/orders/new">
                <FileText className="w-4 h-4" strokeWidth={1.75} />
                New PO
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/procurement/requests/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New request
              </Link>
            </Button>
          </div>
        }
      />
      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Drafts" value={String(draft)} />
        <MetricCard
          label="Awaiting approval"
          value={String(pending)}
          accent={pending > 0}
          hint={pending > 0 ? "review" : undefined}
        />
        <MetricCard label="Open POs" value={String(openOrders)} />
        <MetricCard label="Purchase requests" value={String(requests.length)} />
      </div>

      <Section
        eyebrow="Awaiting approval"
        title="Submitted purchase requests"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/procurement/requests">All requests</Link>
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          {requests.filter((r) => r.status === "submitted").length === 0 ? (
            <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary flex items-center gap-2">
              <ListPlus className="w-4 h-4" strokeWidth={1.75} />
              No requests waiting on approval.
            </p>
          ) : (
            requests
              .filter((r) => r.status === "submitted")
              .slice(0, 6)
              .map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  href={`/dashboard/procurement/requests/${r.id}`}
                />
              ))
          )}
        </div>
      </Section>

      <Section
        eyebrow="Recent POs"
        title="Purchase orders"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/procurement/orders">All orders</Link>
          </Button>
        }
      >
        {orders.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No purchase orders yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {orders.slice(0, 8).map((o) => (
                <li key={o.id} className="p-4 flex items-center justify-between gap-4">
                  <Link href={`/dashboard/procurement/orders/${o.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-ink-tertiary">{o.poCode}</span>
                      <PurchaseOrderStatusPill status={o.status} />
                    </div>
                    <div className="text-sm text-ink mt-1">
                      {o.supplierName ?? "—"}
                      {o.projectName ? ` · ${o.projectName}` : ""}
                    </div>
                  </Link>
                  <div className="text-xs text-ink-tertiary tabular-nums">
                    {o.expectedDelivery ?? "—"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}
