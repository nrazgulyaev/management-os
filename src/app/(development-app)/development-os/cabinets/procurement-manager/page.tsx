import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadProcurementCabinet } from "@/lib/development/server/cabinets/procurement-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

export const metadata: Metadata = { title: "Procurement manager · Cabinet" };
export const dynamic = "force-dynamic";

export default async function ProcurementCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("procurement-manager");
  if (__gateRedirect) redirect(__gateRedirect);

  const data = await safeQuery(
    "procurementCabinet",
    loadProcurementCabinet(),
    {
      pendingApprovalsCount: 0,
      quotationsAwaitingComparisonCount: 0,
      posAwaitingDeliveryCount: 0,
      recentDeliveriesCount: 0,
      latestProcurementAnalystOutputCode: null,
    },
  );
  return (
    <DevelopmentShell>
      <PageHeader
        title="Procurement manager"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Cabinets" },
          { label: "Procurement manager" },
        ]}
        description="Pipeline + supplier performance + AI insights."
      />
      <Section title="Active workflow">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Purchase requests pending"
            value={String(data.pendingApprovalsCount)}
          />
          <MetricCard
            label="Quotations to compare"
            value={String(data.quotationsAwaitingComparisonCount)}
          />
          <MetricCard
            label="Open POs"
            value={String(data.posAwaitingDeliveryCount)}
          />
          <MetricCard
            label="Recent deliveries (7d)"
            value={String(data.recentDeliveriesCount)}
          />
        </div>
      </Section>
      <Section title="AI insights">
        <div className="rounded-md border border-line-soft bg-surface p-4">
          <div className="text-label">Latest procurement analyst</div>
          {data.latestProcurementAnalystOutputCode ? (
            <Link
              href={`/development-os/ai-agents/procurement-analyst/outputs/${data.latestProcurementAnalystOutputCode}`}
              className="text-sm text-info hover:underline"
            >
              {data.latestProcurementAnalystOutputCode} →
            </Link>
          ) : (
            <span className="text-sm text-ink-tertiary">
              No output yet — run the agent from Jobs.
            </span>
          )}
        </div>
      </Section>
    </DevelopmentShell>
  );
}
