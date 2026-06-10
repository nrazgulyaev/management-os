import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { listGuestServiceOrders } from "@/features/guest-services/services";
import {
  formatMinorMoney,
} from "@/features/guest-services/pricing";
import {
  ORDER_STATUS_LABELS,
  toneForStatus,
  type OrderStatus,
} from "@/features/guest-services/status";

export const metadata = { title: "Guest service orders" };
export const dynamic = "force-dynamic";

const ALL_STATUSES: OrderStatus[] = [
  "requested",
  "reviewing",
  "confirmed",
  "scheduled",
  "fulfilled",
  "cancelled",
  "rejected",
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status =
    sp.status && ALL_STATUSES.includes(sp.status as OrderStatus)
      ? (sp.status as OrderStatus)
      : undefined;
  const orders = await listGuestServiceOrders({
    status,
    limit: 200,
  });
  const liveCount = orders.filter((o) =>
    ["requested", "reviewing", "confirmed", "scheduled"].includes(o.status)
  ).length;
  const fulfilledCount = orders.filter((o) => o.status === "fulfilled").length;
  const bridgedCount = orders.filter(
    (o) => o.financeBridgeStatus === "bridged"
  ).length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-services">Guest services</Link> /{" "}
            <span>Orders</span>
          </div>
          <h1>Orders</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Inbound guest service requests. Move them through requested →
            confirmed → scheduled → fulfilled. Fulfilment auto-bridges to
            revenue_lines (skipping if guest_price = 0 or the period is
            locked).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi label="Orders · in view" value={String(orders.length)} />
        <Kpi
          label="Live"
          value={String(liveCount)}
          sub="requested → scheduled"
          tone={liveCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Fulfilled"
          value={String(fulfilledCount)}
          tone={fulfilledCount > 0 ? "success" : undefined}
        />
        <Kpi label="Bridged" value={String(bridgedCount)} sub="to revenue lines" />
      </div>

      <div className="flex flex-wrap gap-2 mb-[14px]">
        <FilterPill href="/dashboard/guest-services/orders" active={!status}>
          All
        </FilterPill>
        {ALL_STATUSES.map((s) => (
          <FilterPill
            key={s}
            href={`/dashboard/guest-services/orders?status=${s}`}
            active={status === s}
          >
            {ORDER_STATUS_LABELS[s]}
          </FilterPill>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Service</th>
              <th scope="col">Villa</th>
              <th scope="col">Date</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">Price</th>
              <th scope="col">Bridge</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <TableEmpty colSpan={8}>No orders match.</TableEmpty>
            ) : (
              orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono text-[11px] text-ink-3">{o.orderCode}</td>
                  <td>
                    <div className="font-medium">{o.serviceName ?? "—"}</div>
                    <div className="text-[11px] text-ink-4">
                      {o.serviceType ?? ""}
                    </div>
                  </td>
                  <td className="text-[12px] text-ink-3">
                    <span className="mono">{o.villaCode ?? "—"}</span>
                    {o.bookingCode && (
                      <div className="mono text-[11px] text-ink-4 mt-0.5">
                        {o.bookingCode}
                      </div>
                    )}
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {o.requestedDate ?? "—"}
                    {o.requestedTime && ` ${o.requestedTime}`}
                  </td>
                  <td>
                    <Badge tone={toneForStatus(o.status as OrderStatus)}>
                      {ORDER_STATUS_LABELS[o.status as OrderStatus]}
                    </Badge>
                  </td>
                  <td className="num mono text-[12px]">
                    {formatMinorMoney(o.guestPriceMinor, o.currency)}
                  </td>
                  <td className="text-[11px] text-ink-4">
                    {o.financeBridgeStatus}
                  </td>
                  <td className="num">
                    <Link
                      href={`/dashboard/guest-services/orders/${o.id}`}
                      className="btn btn-ghost btn-sm"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={active ? "filter-chip on" : "filter-chip"}>
      {children}
    </Link>
  );
}
