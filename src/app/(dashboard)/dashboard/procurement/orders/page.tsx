import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PurchaseOrderStatusPill } from "@/components/procurement/purchase-status-pill";
import { listPurchaseOrders } from "@/features/procurement/services";
import { formatMoneyMinor } from "@/lib/money";
import { DashboardKpi, NoItemsYet } from "@/components/ui/primitives";

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
  const all = await listPurchaseOrders();
  const rows = statusFilter
    ? all.filter((o) => o.status === statusFilter)
    : all;

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
      <PageHeader
        breadcrumbs={[
          { label: "Procurement", href: "/dashboard/procurement" },
          { label: "Orders" },
        ]}
        title="Purchase orders"
        description="Sent → confirmed → partially received → received. Cancelled at any point. Detail page handles per-line receive + status transitions."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/dashboard/procurement/orders/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New PO
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard/procurement">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Procurement
              </Link>
            </Button>
          </div>
        }
      />

      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpi
          label="Open POs"
          value={String(kpiOpen)}
          status={kpiOpen > 0 ? "warn" : "neutral"}
          hint="Sent, confirmed, or partially received"
        />
        <DashboardKpi
          label="Awaiting delivery"
          value={String(kpiAwaitingDelivery)}
          status={kpiAwaitingDelivery > 0 ? "warn" : "neutral"}
          hint="Sent or confirmed, no receipt yet"
        />
        <DashboardKpi
          label="Partially received"
          value={String(kpiPartial)}
          status={kpiPartial > 0 ? "warn" : "neutral"}
          hint="At least one line short-shipped"
        />
        <DashboardKpi
          label="Received"
          value={String(kpiReceived)}
          status="good"
          hint="Closed POs (lifetime)"
        />
      </div>

      <Section
        eyebrow="Filter"
        title={statusFilter ? `Showing ${statusFilter.replace(/_/g, " ")}` : "All purchase orders"}
      >
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
      </Section>
    </div>
  );
}
