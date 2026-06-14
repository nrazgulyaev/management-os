import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Kpi } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PurchaseOrderStatusPill } from "@/components/procurement/purchase-status-pill";
import { PurchaseOrderAddButton } from "@/components/procurement/order-add-button";
import { listPurchaseOrders } from "@/features/procurement/services";
import { listSuppliers } from "@/features/inventory/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";
import { formatMoneyMinor } from "@/lib/money";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Purchase orders" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "confirmed", label: "Confirmed" },
  { value: "partially_received", label: "Partial" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status ?? "";
  const [all, suppliers, projects, villas] = await Promise.all([
    listPurchaseOrders(),
    listSuppliers(),
    listProjects(),
    listVillas(),
  ]);
  const rows = statusFilter
    ? all.filter((o) => o.status === statusFilter)
    : all;
  const supplierOpts = suppliers.map((s) => ({ id: s.id, label: s.name }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));

  const kpiOpen = all.filter(
    (o) => !["received", "cancelled"].includes(o.status),
  ).length;
  const kpiAwaitingDelivery = all.filter(
    (o) => o.status === "sent" || o.status === "confirmed",
  ).length;
  const kpiPartial = all.filter((o) => o.status === "partially_received").length;
  const kpiReceived = all.filter((o) => o.status === "received").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/procurement">Procurement</Link> /{" "}
            <span>Orders</span>
          </div>
          <h1>Purchase orders</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Sent → confirmed → partially received → received. Cancelled at any point. Detail page handles per-line receive + status transitions.
          </p>
        </div>
        <div className="actions">
          <PurchaseOrderAddButton
            suppliers={supplierOpts}
            projects={projectOpts}
            villas={villaOpts}
          />
          <Button asChild variant="secondary">
            <Link href="/dashboard/procurement">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Procurement
            </Link>
          </Button>
        </div>
      </div>

      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Open POs"
          value={String(kpiOpen)}
          tone={kpiOpen > 0 ? "warn" : undefined}
          sub="Sent, confirmed, or partially received"
        />
        <Kpi
          label="Awaiting delivery"
          value={String(kpiAwaitingDelivery)}
          tone={kpiAwaitingDelivery > 0 ? "warn" : undefined}
          sub="Sent or confirmed, no receipt yet"
        />
        <Kpi
          label="Partially received"
          value={String(kpiPartial)}
          tone={kpiPartial > 0 ? "warn" : undefined}
          sub="At least one line short-shipped"
        />
        <Kpi
          label="Received"
          value={String(kpiReceived)}
          tone="success"
          sub="Closed POs (lifetime)"
        />
      </div>

      <div>
        <div className="label mb-2.5">Filter</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {STATUS_FILTERS.map((f) => {
            const isActive = statusFilter === f.value;
            const href = f.value
              ? `/dashboard/procurement/orders?status=${encodeURIComponent(f.value)}`
              : "/dashboard/procurement/orders";
            return (
              <Link
                key={f.value || "all"}
                href={href}
                className={
                  "inline-flex items-center px-3 py-1.5 rounded-full text-xs border transition-colors " +
                  (isActive
                    ? "bg-ink text-ink-inverse border-ink"
                    : "border-line-soft text-ink-secondary hover:border-line-strong")
                }
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {rows.length === 0 ? (
          all.length === 0 ? (
            <NoItemsYet
              entityLabel="purchase orders"
              description="Purchase orders are created from approved purchase requests, or directly from the New PO form for ad-hoc procurement."
              addAction={
                <Button asChild>
                  <Link href="/dashboard/procurement/orders/new">
                    <Plus className="w-4 h-4" strokeWidth={1.75} />
                    New PO
                  </Link>
                </Button>
              }
            />
          ) : (
            <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
              No purchase orders match the {statusFilter.replace(/_/g, " ")} filter.{" "}
              <Link
                href="/dashboard/procurement/orders"
                className="underline underline-offset-4"
              >
                Clear filter
              </Link>
              .
            </p>
          )
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>PO</TH>
                <TH>Supplier</TH>
                <TH>Project</TH>
                <TH>Status</TH>
                <TH>Lines</TH>
                <TH>Expected</TH>
                <TH>Total</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((o) => (
                <TR key={o.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/dashboard/procurement/orders/${o.id}`}
                      className="hover:underline"
                    >
                      {o.poCode}
                    </Link>
                  </TD>
                  <TD>{o.supplierName ?? "—"}</TD>
                  <TD className="text-xs">{o.projectName ?? "—"}</TD>
                  <TD>
                    <PurchaseOrderStatusPill status={o.status} />
                  </TD>
                  <TD className="text-xs">{o.lineCount}</TD>
                  <TD className="text-xs">{o.expectedDelivery ?? "—"}</TD>
                  <TD className="text-xs font-mono">
                    {o.totalMinor !== null && o.currency
                      ? formatMoneyMinor(o.totalMinor, o.currency)
                      : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
