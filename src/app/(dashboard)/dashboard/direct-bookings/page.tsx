import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import {
  getDirectBookingMetrics,
  listDirectBookingHolds,
} from "@/features/direct-booking/services";
import { getDepositMetrics } from "@/features/direct-booking/deposits";
import { getReconciliationMetrics } from "@/features/direct-booking/finance-reconciliation";
import { adminHoldStatusLabel } from "@/features/direct-booking/hold-pure";
import { trace } from "@/lib/observability/perf";

export const metadata = { title: "Direct bookings" };
export const dynamic = "force-dynamic";

const PAGE = "/dashboard/direct-bookings";

function money(minor: bigint, currency: string | null): string {
  const whole = minor / 100n;
  const frac = (minor < 0n ? -minor : minor) % 100n;
  return `${currency ?? ""} ${whole}.${String(frac).padStart(2, "0")}`.trim();
}

export default async function DirectBookingsHub() {
  const [m, dep, recon, holds] = await Promise.all([
    trace(PAGE, "getDirectBookingMetrics", () => getDirectBookingMetrics()),
    trace(PAGE, "getDepositMetrics", () => getDepositMetrics()),
    trace(PAGE, "getReconciliationMetrics", () => getReconciliationMetrics()),
    trace(PAGE, "listDirectBookingHolds", () =>
      listDirectBookingHolds({ status: "active", limit: 12 }),
    ),
  ]);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Direct bookings</span>
          </div>
          <h1>Direct bookings</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Quote → inventory hold → guest request → manual concierge approval →
            canonical booking. The hold layer reserves dates with an internal
            calendar block; conversion is always manual.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/direct-bookings/reconciliation"
            className="btn btn-secondary btn-sm"
          >
            Reconcile →
          </Link>
          <Link href="/dashboard/direct-bookings/holds" className="btn btn-accent btn-sm">
            All holds →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Active holds"
          value={String(m.activeHolds)}
          sub={`${m.expiringSoon} expiring soon`}
        />
        <Kpi
          label="Submitted requests"
          value={String(m.submittedRequests)}
          sub="awaiting review"
          tone={m.submittedRequests > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Pending deposits"
          value={String(dep.pending)}
          sub="deposit gate"
          tone="gold"
        />
        <Kpi
          label="Conversion"
          value={`${Math.round(m.conversionRate * 100)}%`}
          sub="hold → booked"
          tone={m.conversionRate > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Finance links"
          value={String(recon.posted)}
          sub={`${recon.unposted} unposted`}
          tone={recon.unposted > 0 ? undefined : "success"}
        />
      </div>

      <DbStatusNotice />

      {/* Active holds */}
      <div className="flex items-end justify-between mt-2 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          Active holds · <em>{holds.length}</em>
        </h2>
        <Link
          href="/dashboard/direct-bookings/requests"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          Requests →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Hold</th>
              <th scope="col">Villa</th>
              <th scope="col">Dates</th>
              <th scope="col" className="num">Total</th>
              <th scope="col">Status</th>
              <th scope="col">Expires</th>
            </tr>
          </thead>
          <tbody>
            {holds.length === 0 ? (
              <TableEmpty colSpan={6}>No active holds. Holds appear here when guests reserve dates
                  from a public quote.</TableEmpty>
            ) : (
              holds.map(({ hold, villaCode }) => {
                const lab = adminHoldStatusLabel(
                  hold.status as Parameters<typeof adminHoldStatusLabel>[0],
                );
                return (
                  <tr key={hold.id}>
                    <td className="mono text-[11px] text-ink-3">
                      <Link
                        href={`/dashboard/direct-bookings/holds/${hold.id}`}
                        className="hover:text-terra"
                      >
                        {hold.holdCode}
                      </Link>
                    </td>
                    <td className="mono">{villaCode ?? "—"}</td>
                    <td className="mono text-[12px]">
                      {hold.checkIn} → {hold.checkOut} · {hold.nights}n
                    </td>
                    <td className="num mono text-[12px]">
                      {money(hold.totalMinor, hold.currency)}
                    </td>
                    <td>
                      <Badge tone={lab.tone}>{lab.label}</Badge>
                    </td>
                    <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                      {hold.expiresAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Related surfaces */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
        {[
          { href: "/dashboard/direct-bookings/holds", title: "Holds", detail: "Active / expired / cancelled" },
          { href: "/dashboard/direct-bookings/requests", title: "Requests", detail: "Submitted / approved / rejected" },
          { href: "/dashboard/direct-bookings/deposits", title: "Deposits", detail: `${dep.pending} pending · ${dep.failed} failed` },
          { href: "/dashboard/direct-bookings/reconciliation", title: "Reconciliation", detail: `${recon.unposted} unposted` },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card p-4 block hover:border-line-strong transition-colors"
          >
            <div className="text-ink font-medium text-[14px]">{c.title}</div>
            <div className="text-[12px] text-ink-3 mt-1">{c.detail}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
