import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import {
  getReconciliationMetrics,
  listDirectBookingFinanceLinks,
} from "@/features/direct-booking/finance-reconciliation";
import { directBookingFinanceStatusLabel } from "@/features/direct-booking/finance-pure";
import { ReconcilePendingButton } from "@/components/direct-booking/reconcile-buttons";

export const metadata = { title: "Direct booking reconciliation" };
export const dynamic = "force-dynamic";

export default async function ReconciliationHub({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  type LinkStatus = Parameters<typeof directBookingFinanceStatusLabel>[0];
  const status = (sp.status as LinkStatus | undefined) || undefined;
  const [metrics, rows] = await Promise.all([
    getReconciliationMetrics(),
    listDirectBookingFinanceLinks({ status, limit: 200 }),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Reconciliation" },
        ]}
        title="Direct booking reconciliation"
        description="Idempotent finance bridge per request: deposit + booking + revenue line + statement period."
        actions={<ReconcilePendingButton />}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard
          label="Converted but unposted"
          value={String(metrics.unposted)}
          accent={metrics.unposted > 0}
        />
        <MetricCard label="Posted revenue" value={String(metrics.posted)} />
        <MetricCard
          label="Skipped (locked period)"
          value={String(metrics.skippedLocked)}
          accent={metrics.skippedLocked > 0}
        />
        <MetricCard
          label="Failed"
          value={String(metrics.failed)}
          accent={metrics.failed > 0}
        />
        <MetricCard
          label="Balance due (posted)"
          value={`${(metrics.totalBalanceDueMinor / 100n).toString()}.${String(metrics.totalBalanceDueMinor % 100n).padStart(2, "0")} ${metrics.currency ?? ""}`}
        />
      </div>
      <Section eyebrow="Catalog" title={`${rows.length} finance links`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Gross</th>
                <th className="px-4 py-3">Balance due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Posted</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No finance links yet. Click "Reconcile pending" to sweep
                    converted requests.
                  </td>
                </tr>
              )}
              {rows.map(({ link, requestCode, bookingCode }) => {
                const lab = directBookingFinanceStatusLabel(
                  link.status as LinkStatus,
                );
                return (
                  <tr key={link.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/dashboard/direct-bookings/reconciliation/${link.id}`}
                        className="text-ink hover:underline underline-offset-4"
                      >
                        {link.linkCode}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {requestCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {bookingCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {(link.grossAmountMinor / 100n).toString()}.
                      {String(link.grossAmountMinor % 100n).padStart(2, "0")}{" "}
                      {link.currency}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {(link.balanceDueMinor / 100n).toString()}.
                      {String(link.balanceDueMinor % 100n).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={lab.tone}>{lab.label}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                      {link.postedAt?.toISOString() ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <p className="text-xs text-ink-tertiary">
        Owner-side projection of these bookings lives at{" "}
        <Link
          href="/dashboard/owner-intelligence/bookings"
          className="underline"
        >
          owner intelligence → booking projection
        </Link>
        . Owners never see the raw finance link rows; they see only the
        owner-safe summary backed by it.
      </p>
    </div>
  );
}
