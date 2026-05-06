import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest services", href: "/dashboard/guest-services" },
          { label: "Finance bridge" },
        ]}
        title="Finance bridge"
        description="Each fulfilled order should have a row in revenue_lines. We auto-bridge on fulfilment and surface anything that didn't go through (locked period, no charge, manual retry needed)."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Bridged" value={String(bridged.length)} />
        <Stat label="Pending" value={String(pending.length)} />
        <Stat label="Locked period" value={String(skippedLocked.length)} />
        <Stat
          label="Total revenue (bridged)"
          value={
            stats.currency
              ? formatMinorMoney(stats.bridgedRevenueMinor, stats.currency)
              : "—"
          }
        />
      </div>

      <Section
        eyebrow="Action needed"
        title={`${pending.length} pending`}
        description="Open each order to retry the bridge. Failures usually mean the booking's villa or project moved after fulfilment."
      >
        <BridgeTable rows={pending} emptyHint="Nothing pending. Nice." />
      </Section>

      <Section
        eyebrow="Awaiting unlock"
        title={`${skippedLocked.length} locked-period`}
        description="These orders fulfilled during a locked or closed accounting period. Use a finance adjustment instead of bridging."
      >
        <BridgeTable rows={skippedLocked} emptyHint="No orders against locked periods." />
      </Section>

      <Section
        eyebrow="History"
        title={`${bridged.length} bridged`}
        description="Already in revenue_lines. Click through if you need to drill in."
      >
        <BridgeTable rows={bridged.slice(0, 20)} emptyHint="No bridged orders yet." />
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-5">
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="text-2xl font-mono tabular-nums text-ink mt-1">{value}</div>
    </div>
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
      <div className="rounded-md border border-line-soft bg-surface p-6 text-center text-xs text-ink-tertiary">
        {emptyHint}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-canvas/50 text-left">
          <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            <th className="px-4 py-3">Code</th>
            <th className="px-4 py-3">Service</th>
            <th className="px-4 py-3">Villa</th>
            <th className="px-4 py-3">Fulfilled</th>
            <th className="px-4 py-3">Bridge</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-t border-line-soft">
              <td className="px-4 py-3 font-mono text-xs">{o.orderCode}</td>
              <td className="px-4 py-3">{o.serviceName ?? "—"}</td>
              <td className="px-4 py-3 text-xs">
                {o.villaCode ?? "—"}
                {o.bookingCode && (
                  <div className="text-[11px] text-ink-tertiary mt-0.5">
                    {o.bookingCode}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {o.fulfilledAt
                  ? new Date(o.fulfilledAt).toISOString().slice(0, 10)
                  : "—"}
              </td>
              <td className="px-4 py-3">
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
              <td className="px-4 py-3 font-mono tabular-nums text-xs">
                {formatMinorMoney(o.guestPriceMinor, o.currency)}
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
  );
}
