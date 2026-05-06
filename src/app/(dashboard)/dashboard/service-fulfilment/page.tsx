import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { getFulfilmentMetrics } from "@/features/service-fulfilment/services";
import { formatFulfilmentAmountForAdmin } from "@/features/service-fulfilment/pricing-pure";
import { BridgePendingButton } from "@/components/service-fulfilment/buttons";

export const metadata = { title: "Service fulfilment" };
export const dynamic = "force-dynamic";

export default async function ServiceFulfilmentHub() {
  const m = await getFulfilmentMetrics();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Service fulfilment" }]}
        title="Service fulfilment"
        description="Triage guest service requests, dispatch vendors, track ETAs, capture invoices + ratings, and bridge to finance — all without leaking guest contact info or owner finance to vendors."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="New" value={String(m.newCount)} />
        <MetricCard label="Triage" value={String(m.triageCount)} accent={m.triageCount > 0} />
        <MetricCard
          label="Awaiting vendor"
          value={String(m.awaitingVendorCount)}
          accent={m.awaitingVendorCount > 0}
        />
        <MetricCard label="Scheduled today" value={String(m.scheduledTodayCount)} />
        <MetricCard label="Failed" value={String(m.failedCount)} accent={m.failedCount > 0} />
        <MetricCard label="Cancelled" value={String(m.cancelledCount)} />
        <MetricCard
          label="Unbridged completed"
          value={String(m.unbridgedCompletedCount)}
          accent={m.unbridgedCompletedCount > 0}
        />
        <MetricCard
          label="Total margin (completed)"
          value={formatFulfilmentAmountForAdmin(m.totalMarginMinor, m.marginCurrency)}
        />
      </div>
      <Section eyebrow="Operate" title="Run the bridge">
        <BridgePendingButton />
      </Section>
      <Section eyebrow="Surfaces" title="Where to go next">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <HubLink
            href="/dashboard/service-fulfilment/fulfilments"
            title="Fulfilments"
            description="Triage queue, ETA tracking, completion."
          />
          <HubLink
            href="/dashboard/service-fulfilment/vendors"
            title="Vendors"
            description="Vendor registry + service mappings."
          />
          <HubLink
            href="/dashboard/service-fulfilment/invoices"
            title="Invoices"
            description="Vendor invoice tracking + approval."
          />
          <HubLink
            href="/dashboard/service-fulfilment/ratings"
            title="Ratings"
            description="Post-fulfilment guest ratings."
          />
          <HubLink
            href="/dashboard/service-fulfilment/finance-bridge"
            title="Finance bridge"
            description="Bridge completed fulfilments to revenue + expense lines."
          />
        </div>
      </Section>
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
