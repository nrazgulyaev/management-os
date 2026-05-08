import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadMarketingCabinet } from "@/lib/development/server/cabinets/marketing-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

export const metadata: Metadata = { title: "Marketing staff · Cabinet" };
export const dynamic = "force-dynamic";

export default async function MarketingStaffCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("marketing-staff");
  if (__gateRedirect) redirect(__gateRedirect);

  const data = await safeQuery(
    "marketingCabinet",
    loadMarketingCabinet(),
    {
      contentByStatus: {},
      contentApprovalQueueCount: 0,
      scheduledThisWeekCount: 0,
      recentlyPublishedCount: 0,
      activeCampaignsCount: 0,
      leadsThisWeek: 0,
      hotLeadsCount: 0,
      latestMarketingAssistantOutputCode: null,
    },
  );
  return (
    <DevelopmentShell>
      <PageHeader
        title="Marketing staff"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Cabinets" },
          { label: "Marketing staff" },
        ]}
        description="Content + campaigns + leads."
      />
      <Section title="Content pipeline">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Approval queue"
            value={String(data.contentApprovalQueueCount)}
          />
          <MetricCard
            label="Scheduled this week"
            value={String(data.scheduledThisWeekCount)}
          />
          <MetricCard
            label="Published last 7d"
            value={String(data.recentlyPublishedCount)}
          />
          <MetricCard
            label="Active campaigns"
            value={String(data.activeCampaignsCount)}
          />
        </div>
      </Section>
      <Section title="Lead generation">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard label="Leads this week" value={String(data.leadsThisWeek)} />
          <MetricCard label="Hot leads" value={String(data.hotLeadsCount)} />
        </div>
      </Section>
      <Section title="AI assistance">
        <div className="rounded-md border border-line-soft bg-surface p-4">
          <div className="text-label">Latest marketing assistant</div>
          {data.latestMarketingAssistantOutputCode ? (
            <Link
              href={`/development-os/ai-agents/marketing-assistant/outputs/${data.latestMarketingAssistantOutputCode}`}
              className="text-sm text-info hover:underline"
            >
              {data.latestMarketingAssistantOutputCode} →
            </Link>
          ) : (
            <span className="text-sm text-ink-tertiary">No output yet</span>
          )}
        </div>
      </Section>
    </DevelopmentShell>
  );
}
