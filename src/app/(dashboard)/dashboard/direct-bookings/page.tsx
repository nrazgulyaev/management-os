import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { getDirectBookingMetrics } from "@/features/direct-booking/services";
import { getDepositMetrics } from "@/features/direct-booking/deposits";
import { getReconciliationMetrics } from "@/features/direct-booking/finance-reconciliation";
import { trace } from "@/lib/observability/perf";

export const metadata = { title: "Direct bookings" };
export const dynamic = "force-dynamic";

const PAGE = "/dashboard/direct-bookings";

export default async function DirectBookingsHub() {
  // 8.C.8 — parallelize. Sequential awaits compounded cold-start
  // latency and the page hung > 60s in audit. 8.E.2 — wrap each query
  // with `trace()` so the Vercel function logs surface which query is
  // the slow one (parallelization didn't fully resolve the hang;
  // identifying the offender lives in the runtime perf log).
  const [m, dep, recon] = await Promise.all([
    trace(PAGE, "getDirectBookingMetrics", () => getDirectBookingMetrics()),
    trace(PAGE, "getDepositMetrics", () => getDepositMetrics()),
    trace(PAGE, "getReconciliationMetrics", () => getReconciliationMetrics()),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Direct bookings" }]}
        title="Direct bookings"
        description="Quote → temporary inventory hold → guest contact form → manual concierge approval → canonical booking. No payment processing yet."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard label="Active holds" value={String(m.activeHolds)} />
        <MetricCard
          label="Submitted requests"
          value={String(m.submittedRequests)}
          accent={m.submittedRequests > 0}
        />
        <MetricCard
          label="Expiring in 5 min"
          value={String(m.expiringSoon)}
          accent={m.expiringSoon > 0}
        />
        <MetricCard label="Approved today" value={String(m.approvedToday)} />
        <MetricCard label="Rejected today" value={String(m.rejectedToday)} />
        <MetricCard
          label="Conversion rate"
          value={`${Math.round(m.conversionRate * 100)}%`}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard label="Pending deposits" value={String(dep.pending)} accent={dep.pending > 0} />
        <MetricCard label="Paid deposits" value={String(dep.paid + dep.manuallyMarkedPaid)} />
        <MetricCard label="Failed / expired" value={String(dep.failed)} accent={dep.failed > 0} />
        <MetricCard label="Unposted converted" value={String(recon.unposted)} accent={recon.unposted > 0} />
        <MetricCard label="Posted finance links" value={String(recon.posted)} />
        <MetricCard
          label="Locked-period skips"
          value={String(recon.skippedLocked)}
          accent={recon.skippedLocked > 0}
        />
      </div>
      <Section eyebrow="Surfaces" title="Where to go next">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <HubLink
            href="/dashboard/direct-bookings/holds"
            title="Holds"
            description="Active / expired / cancelled holds."
          />
          <HubLink
            href="/dashboard/direct-bookings/requests"
            title="Requests"
            description="Submitted / under review / approved / rejected."
          />
          <HubLink
            href="/dashboard/direct-bookings/deposits"
            title="Deposits"
            description="Deposit gate per request — manual stub today."
          />
          <HubLink
            href="/dashboard/payments"
            title="Payments hub"
            description="Provider configuration + webhook envelopes."
          />
          <HubLink
            href="/dashboard/direct-bookings/reconciliation"
            title="Reconciliation"
            description="Finance bridge between requests and revenue lines."
          />
        </div>
      </Section>
      <p className="text-xs text-ink-tertiary">
        No payment processing here. The hold layer reserves dates with an
        internal calendar block; conversion to a confirmed booking is always
        manual.
      </p>
    </div>
  );
}

function HubLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-line-soft bg-surface p-4 hover:border-line-strong"
    >
      <div className="text-sm text-ink font-medium">{title}</div>
      <div className="text-xs text-ink-tertiary mt-1">{description}</div>
    </Link>
  );
}
