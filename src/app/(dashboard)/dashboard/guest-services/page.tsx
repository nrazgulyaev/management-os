import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import {
  getOrderStats,
  listAllCatalogServices,
  listCategories,
  listGuestServiceOrders,
} from "@/features/guest-services/services";
import { formatMinorMoney } from "@/features/guest-services/pricing";

export const metadata = { title: "Guest services" };
export const dynamic = "force-dynamic";

const ORDER_TONE: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger" | "gold"
> = {
  requested: "info",
  reviewing: "info",
  confirmed: "gold",
  scheduled: "gold",
  fulfilled: "success",
  cancelled: "neutral",
  rejected: "danger",
};

export default async function GuestServicesHub() {
  const [stats, categories, services, orders] = await Promise.all([
    getOrderStats(),
    listCategories(),
    listAllCatalogServices({ limit: 200 }),
    listGuestServiceOrders({ limit: 12 }),
  ]);
  const activeServices = services.filter((s) => s.status === "active").length;

  const topServices = [...services]
    .filter((s) => s.status === "active")
    .slice(0, 12);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> / <span>Services</span>
          </div>
          <h1>Guest services</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            The upsell catalog + concierge orders from /stay/[token]/services.
            Per-villa overrides, quote-required items, internal cost tracking —
            margin visible to ops only, never the guest.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/guest-services/finance-bridge" className="btn btn-secondary btn-sm">
            Bridge orders →
          </Link>
          <Link href="/dashboard/guest-services/catalog" className="btn btn-accent btn-sm">
            Catalog →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Catalog · active" value={String(activeServices)} sub={`${categories.length} categories`} />
        <Kpi
          label="Live orders"
          value={String(stats.active)}
          sub={`${stats.total} total`}
          tone={stats.active > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Fulfilled"
          value={String(stats.fulfilled)}
          sub={`${stats.cancelled} cancelled`}
          tone={stats.fulfilled > 0 ? "success" : undefined}
        />
        <Kpi
          label="Bridged revenue"
          value={stats.currency ? formatMinorMoney(stats.bridgedRevenueMinor, stats.currency) : "—"}
          sub="to statements"
        />
        <Kpi
          label="Bridge pending"
          value={String(stats.pendingFinanceBridge)}
          sub={stats.pendingFinanceBridge > 0 ? "fulfilled, unbridged" : "all bridged"}
          tone="gold"
        />
      </div>

      {/* Catalog */}
      <div className="flex items-end justify-between mt-2 mb-3.5">
        <h2 className="display text-[22px] font-normal">Catalog · top services</h2>
        <Link
          href="/dashboard/guest-services/catalog"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All services →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Category</th>
              <th scope="col">Type</th>
              <th scope="col" className="num">Price</th>
              <th scope="col" className="num">Margin</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {topServices.length === 0 ? (
              <TableEmpty colSpan={6}>No active catalog services yet.</TableEmpty>
            ) : (
              topServices.map((s) => {
                const base = Number(s.basePriceMinor);
                const cost = s.internalCostMinor != null ? Number(s.internalCostMinor) : null;
                const margin = cost != null && base > 0 ? Math.round(((base - cost) / base) * 100) : null;
                return (
                  <tr key={s.id}>
                    <td>
                      <Link
                        href={`/dashboard/guest-services/catalog/${s.id}`}
                        className="hover:text-terra"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="text-[12px] text-ink-3">{s.categoryName ?? "—"}</td>
                    <td className="text-[12px] text-ink-3">{s.serviceType}</td>
                    <td className="num mono text-[12px]">
                      {s.pricingModel === "quote_required"
                        ? "quote"
                        : formatMinorMoney(s.basePriceMinor, s.currency)}
                    </td>
                    <td className="num mono text-[12px]">{margin != null ? `${margin}%` : "—"}</td>
                    <td>
                      <Badge tone={s.status === "active" ? "success" : "neutral"}>{s.status}</Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Orders in flight */}
      <h2 className="display text-[22px] font-normal mt-8 mb-3.5" id="orders">
        Orders · in flight
      </h2>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Service</th>
              <th scope="col">Villa</th>
              <th scope="col">Guest</th>
              <th scope="col">Booking</th>
              <th scope="col" className="num">Price</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <TableEmpty colSpan={7}>No orders yet. Guests order from the in-stay services page.</TableEmpty>
            ) : (
              orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono text-[11px] text-ink-3">
                    <Link
                      href={`/dashboard/guest-services/orders/${o.id}`}
                      className="hover:text-terra"
                    >
                      {o.orderCode}
                    </Link>
                  </td>
                  <td>{o.serviceName ?? "—"}</td>
                  <td className="mono">{o.villaCode ?? "—"}</td>
                  <td className="text-[12px] text-ink-3">{o.guestDisplay ?? "—"}</td>
                  <td className="mono text-[11px] text-ink-4">{o.bookingCode ?? "—"}</td>
                  <td className="num mono text-[12px]">
                    {formatMinorMoney(o.guestPriceMinor, o.currency)}
                  </td>
                  <td>
                    <Badge tone={ORDER_TONE[o.status] ?? "neutral"}>{o.status}</Badge>
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
