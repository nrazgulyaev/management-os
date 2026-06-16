import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Card, Kpi, SectionHeading } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import {
  getDirectBookingMetrics,
  listDirectBookingHolds,
} from "@/features/direct-booking/services";
import { getDepositMetrics } from "@/features/direct-booking/deposits";
import { getReconciliationMetrics } from "@/features/direct-booking/finance-reconciliation";
import { adminHoldStatusLabel } from "@/features/direct-booking/hold-pure";
import { requireOrgId } from "@/features/auth/require-org";
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
  const organizationId = await requireOrgId();
  const [m, dep, recon, holds] = await Promise.all([
    trace(PAGE, "getDirectBookingMetrics", () =>
      getDirectBookingMetrics(organizationId),
    ),
    trace(PAGE, "getDepositMetrics", () => getDepositMetrics(organizationId)),
    trace(PAGE, "getReconciliationMetrics", () =>
      getReconciliationMetrics(organizationId),
    ),
    trace(PAGE, "listDirectBookingHolds", () =>
      listDirectBookingHolds({ status: "active", limit: 12 }),
    ),
  ]);

  const confirmedPct = Math.round(m.conversionRate * 100);

  return (
    <>
      <SectionHeading
        eyebrow="Direct bookings · commission-free pipeline"
        title={
          <>
            Holds to <em>confirmed</em>.
          </>
        }
        subtitle="Inbound enquiries become holds, deposits, and confirmed stays — every step reconciled against the channel calendar."
        actions={
          <>
            <Link
              href="/dashboard/direct-bookings/reconciliation"
              className="btn btn-secondary btn-sm"
            >
              Reconcile →
            </Link>
            <Link
              href="/dashboard/direct-bookings/holds"
              className="btn btn-secondary btn-sm"
            >
              All holds →
            </Link>
            <Link
              href="/dashboard/direct-bookings/new"
              className="btn btn-accent btn-sm"
            >
              + New direct booking
            </Link>
          </>
        }
      />

      {/* Conversion funnel */}
      <Card padding="default" className="mb-[18px]">
        <div className="dist-card-h">
          <h3>Conversion funnel</h3>
          <span className="meta">Direct channel</span>
        </div>
        <div className="dist-funnel">
          <div className="dist-step">
            <div className="l">Active holds</div>
            <div className="v">{m.activeHolds}</div>
            <div className="c">{m.expiringSoon} expiring soon</div>
          </div>
          <div className="dist-step">
            <div className="l">Submitted</div>
            <div className="v">{m.submittedRequests}</div>
            <div className="c">awaiting review</div>
          </div>
          <div className="dist-step hot">
            <div className="l">Deposit pending</div>
            <div className="v">{dep.pending}</div>
            <div className="c">needs nudge</div>
          </div>
          <div className="dist-step">
            <div className="l">Conversion</div>
            <div className="v">{confirmedPct}%</div>
            <div className="c">hold → booked</div>
          </div>
        </div>
      </Card>

      <DbStatusNotice />

      <div className="dist-2col mt-[18px]">
        {/* Active holds */}
        <Card padding="none" overflowHidden>
          <div className="dist-card-h px-5 pt-[18px]">
            <h3>Active holds</h3>
            <span className="meta">{holds.length} open</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Hold</th>
                <th scope="col">Villa</th>
                <th scope="col">Dates</th>
                <th scope="col" className="num">Total</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {holds.length === 0 ? (
                <TableEmpty colSpan={5}>No active holds. Holds appear here when guests reserve dates
                    from a public quote — or when an operator places one on a
                    guest&apos;s behalf.</TableEmpty>
              ) : (
                holds.map(({ hold, villaCode }) => {
                  const lab = adminHoldStatusLabel(
                    hold.status as Parameters<typeof adminHoldStatusLabel>[0],
                  );
                  return (
                    <tr key={hold.id}>
                      <td className="mono text-[11px] text-ink-3">
                        <Link
                          href={`/dashboard/direct-bookings/${hold.id}`}
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>

        {/* Reconciliation rail */}
        <Card padding="default">
          <div className="dist-card-h">
            <h3>Reconciliation</h3>
          </div>
          <p className="text-[13px] text-ink-3 mb-3.5 mt-0">
            {recon.unposted} direct bookings await calendar match against OTA
            feeds — clear before they double-book.
          </p>
          <div className="mb-2.5">
            <Kpi
              label="Unmatched"
              value={String(recon.unposted)}
              sub="vs channel calendar"
              tone={recon.unposted > 0 ? "warn" : "success"}
            />
          </div>
          <Link
            href="/dashboard/direct-bookings/reconciliation"
            className="btn btn-accent w-full justify-center"
          >
            Open reconciliation
          </Link>
        </Card>
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
