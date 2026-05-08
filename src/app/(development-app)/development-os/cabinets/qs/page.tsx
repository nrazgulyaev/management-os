import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadQsCabinet } from "@/lib/development/server/cabinets/qs-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

export const metadata: Metadata = { title: "QS / Cost analyst · Cabinet" };
export const dynamic = "force-dynamic";

export default async function QsCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("qs");
  if (__gateRedirect) redirect(__gateRedirect);

  const data = await safeQuery(
    "qsCabinet",
    loadQsCabinet(),
    {
      activeBoqCount: 0,
      recentBoqs: [],
      latestQsAnalystOutputCode: null,
      awaitingQsAnalysisCount: 0,
      recentSpecificationsCount: 0,
    },
  );
  return (
    <DevelopmentShell>
      <PageHeader
        title="QS / Cost analyst"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Cabinets" },
          { label: "QS / Cost analyst" },
        ]}
        description="BOQ + cost tracking + AI cost analysis."
      />
      <Section title="Top-line">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Active BOQs" value={String(data.activeBoqCount)} />
          <MetricCard
            label="Awaiting QS analysis"
            value={String(data.awaitingQsAnalysisCount)}
          />
          <MetricCard
            label="Specs added (30d)"
            value={String(data.recentSpecificationsCount)}
          />
          <div className="rounded-md border border-line-soft bg-surface p-4">
            <div className="text-label">Latest analysis</div>
            {data.latestQsAnalystOutputCode ? (
              <Link
                href={`/development-os/ai-agents/qs-cost-analyst/outputs/${data.latestQsAnalystOutputCode}`}
                className="text-sm text-info hover:underline"
              >
                {data.latestQsAnalystOutputCode} →
              </Link>
            ) : (
              <span className="text-sm text-ink-tertiary">No output</span>
            )}
          </div>
        </div>
      </Section>
      <Section title="Recent BOQs">
        {data.recentBoqs.length === 0 ? (
          <EmptyState title="No BOQs" description="Create your first BOQ document." />
        ) : (
          <ul className="text-sm space-y-1">
            {data.recentBoqs.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between border-b border-line-soft py-2"
              >
                <span>{b.title}</span>
                <Badge tone="neutral">{b.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </DevelopmentShell>
  );
}
