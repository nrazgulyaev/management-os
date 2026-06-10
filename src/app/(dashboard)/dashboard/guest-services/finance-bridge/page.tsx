import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import {
  getOrderStats,
  listGuestServiceOrders,
} from "@/features/guest-services/services";
import {
  formatMinorMoney,
} from "@/features/guest-services/pricing";

export const metadata = { title: "Guest service finance bridge" };
export const dynamic = "force-dynamic";

export default async function FinanceBridgePage() {
  const [stats, fulfilled] = await Promise.all([
    getOrderStats(),
    listGuestServiceOrders({ status: "fulfilled", limit: 200 }),
  ]);
  const pending = fulfilled.filter(
    (o) => o.financeBridgeStatus === "pending" || o.financeBridgeStatus === "failed",
  );
  const skippedLocked = fulfilled.filter(
    (o) => o.financeBridgeStatus === "skipped_locked_period",
  );
  const bridged = fulfilled.filter(
    (o) => o.financeBridgeStatus === "bridged",
  );

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-services">Guest services</Link> /{" "}
            <span>Finance bridge</span>
          </div>
          <h1>Finance bridge</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Each fulfilled order should have a row in revenue_lines. We
            auto-bridge on fulfilment and surface anything that didn&apos;t go
            through (locked period, no charge, manual retry needed).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi
          label="Bridged"
          value={String(bridged.length)}
          tone={bridged.length > 0 ? "success" : undefined}
        />
        <Kpi
          label="Pending"
          value={String(pending.length)}
          tone={pending.length > 0 ? "warn" : undefined}
        />
        <Kpi label="Locked period" value={String(skippedLocked.length)} />
        <Kpi
          label="Total revenue (bridged)"
          value={
            stats.currency
              ? formatMinorMoney(stats.bridgedRevenueMinor, stats.currency)
              : "—"
          }
        />
      </div>

      <div className="mb-3.5">
        <h2 className="display text-[22px] font-normal">
          {pending.length} pending
        </h2>
        <p className="text-[13px] text-ink-3 mt-1 max-w-[760px]">
          Open each order to retry the bridge. Failures usually mean the
          booking&apos;s villa or project moved after fulfilment.
        </p>
      </div>
      <BridgeTable rows={pending} emptyHint="Nothing pending. Nice." />

      <div className="mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          {skippedLocked.length} locked-period
        </h2>
        <p className="text-[13px] text-ink-3 mt-1 max-w-[760px]">
          These orders fulfilled during a locked or closed accounting period.
          Use a finance adjustment instead of bridging.
        </p>
      </div>
      <BridgeTable rows={skippedLocked} emptyHint="No orders against locked periods." />

      <div className="mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          {bridged.length} bridged
        </h2>
        <p className="text-[13px] text-ink-3 mt-1 max-w-[760px]">
          Already in revenue_lines. Click through if you need to drill in.
        </p>
      </div>
      <BridgeTable rows={bridged.slice(0, 20)} emptyHint="No bridged orders yet." />
    </>
  );
}

function BridgeTable({
  rows,
  emptyHint,
}: {
  rows: Array<{
    id: string;
    orderCode: string;
    serviceName: string | null;
    villaCode: string | null;
    bookingCode: string | null;
    guestPriceMinor: bigint;
    currency: string;
    financeBridgeStatus: string;
    fulfilledAt: Date | null;
  }>;
  emptyHint: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="card px-5 py-[18px] text-center text-xs text-ink-4">
        {emptyHint}
      </div>
    );
  }
  return (
    <div className="card p-0 overflow-hidden">
      <table className="data">
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Service</th>
            <th scope="col">Villa</th>
            <th scope="col">Fulfilled</th>
            <th scope="col">Bridge</th>
            <th scope="col" className="num">Amount</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td className="mono text-[11px] text-ink-3">{o.orderCode}</td>
              <td>{o.serviceName ?? "—"}</td>
              <td className="text-[12px]">
                <span className="mono">{o.villaCode ?? "—"}</span>
                {o.bookingCode && (
                  <div className="mono text-[11px] text-ink-4 mt-0.5">
                    {o.bookingCode}
                  </div>
                )}
              </td>
              <td className="text-[12px] text-ink-3">
                {o.fulfilledAt
                  ? new Date(o.fulfilledAt).toISOString().slice(0, 10)
                  : "—"}
              </td>
              <td>
                <Badge
                  tone={
                    o.financeBridgeStatus === "bridged"
                      ? "success"
                      : o.financeBridgeStatus === "skipped_locked_period"
                        ? "warning"
                        : "info"
                  }
                >
                  {o.financeBridgeStatus}
                </Badge>
              </td>
              <td className="num mono text-[12px]">
                {formatMinorMoney(o.guestPriceMinor, o.currency)}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
