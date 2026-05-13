import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest services", href: "/dashboard/guest-services" },
          { label: "Orders" },
        ]}
        title="Orders"
        description="Inbound guest service requests. Move them through requested → confirmed → scheduled → fulfilled. Fulfilment auto-bridges to revenue_lines (skipping if guest_price = 0 or the period is locked)."
      />
      <Section eyebrow="Filter" title={`${orders.length} orders`}>
        <div className="flex flex-wrap gap-2 mb-4">
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
        <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Villa</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Bridge</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-ink-tertiary">
                    No orders match.
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">{o.orderCode}</td>
                  <td className="px-4 py-3">
                    <div className="text-ink font-medium">{o.serviceName ?? "—"}</div>
                    <div className="text-[11px] text-ink-tertiary">
                      {o.serviceType ?? ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-secondary">
                    {o.villaCode ?? "—"}
                    {o.bookingCode && (
                      <div className="text-[11px] text-ink-tertiary mt-0.5">
                        {o.bookingCode}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {o.requestedDate ?? "—"}
                    {o.requestedTime && ` ${o.requestedTime}`}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={toneForStatus(o.status as OrderStatus)}>
                      {ORDER_STATUS_LABELS[o.status as OrderStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {formatMinorMoney(o.guestPriceMinor, o.currency)}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                    {o.financeBridgeStatus}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/guest-services/orders/${o.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
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
    <Link
      href={href}
      className={`h-8 px-3 inline-flex items-center rounded-full text-xs ${
        active
          ? "bg-ink text-ink-inverse"
          : "border border-line-soft text-ink-secondary hover:border-line-strong"
      }`}
    >
      {children}
    </Link>
  );
}
