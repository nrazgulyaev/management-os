import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { getDepositMetrics } from "@/features/direct-booking/deposits";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsHub() {
  const m = await getDepositMetrics();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Payments" }]}
        title="Payments"
        description="Provider configuration + webhook envelopes. Manual stub is the only provider wired today."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard label="Pending deposits" value={String(m.pending)} />
        <MetricCard label="Paid deposits" value={String(m.paid)} />
        <MetricCard
          label="Manually marked paid"
          value={String(m.manuallyMarkedPaid)}
        />
        <MetricCard label="Failed / expired" value={String(m.failed)} accent={m.failed > 0} />
        <MetricCard
          label="Collected"
          value={`${(m.totalCollectedMinor / 100n).toString()}.${String(m.totalCollectedMinor % 100n).padStart(2, "0")} ${m.currency ?? ""}`}
        />
      </div>
      <Section eyebrow="Surfaces" title="Where to go next">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <HubLink href="/dashboard/payments/providers" title="Providers" description="Configured payment providers." />
          <HubLink href="/dashboard/payments/webhooks" title="Webhooks" description="Incoming provider events (idempotent)." />
          <HubLink href="/dashboard/direct-bookings/deposits" title="Deposits" description="Direct booking deposits + actions." />
        </div>
      </Section>
      <p className="text-xs text-ink-tertiary">
        No real provider integration is active. The manual stub records
        deposits as `pending`; admins flip them to `manually_marked_paid` to
        gate booking conversion.
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
