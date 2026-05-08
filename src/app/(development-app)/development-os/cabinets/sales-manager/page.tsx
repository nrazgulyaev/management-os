import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { loadSalesCabinet } from "@/lib/development/server/cabinets/sales-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

export const metadata: Metadata = { title: "Sales manager · Cabinet" };
export const dynamic = "force-dynamic";

export default async function SalesManagerCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("sales-manager");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  if (!me) {
    return (
      <DevelopmentShell>
        <PageHeader title="Sales manager" />
        <EmptyState title="Sign in" description="Log in to see your pipeline." />
      </DevelopmentShell>
    );
  }
  const data = await safeQuery(
    "salesCabinet",
    loadSalesCabinet(me.id),
    {
      hotLeadsCount: 0,
      activeConversationsCount: 0,
      reservationsThisMonth: 0,
      contractsThisMonth: 0,
      followupsOverdueCount: 0,
      managerWeeklySnapshot: null,
      topHotLeads: [],
    },
  );
  return (
    <DevelopmentShell>
      <PageHeader
        title="Sales manager"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Cabinets" },
          { label: "Sales manager" },
        ]}
        description="Per-manager pipeline + performance + follow-ups."
      />
      <Section title="My active pipeline">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Hot leads" value={String(data.hotLeadsCount)} />
          <MetricCard
            label="Active conversations"
            value={String(data.activeConversationsCount)}
          />
          <MetricCard
            label="Reservations this month"
            value={String(data.reservationsThisMonth)}
          />
          <MetricCard
            label="Contracts this month"
            value={String(data.contractsThisMonth)}
          />
        </div>
      </Section>
      <Section title="Follow-ups">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            label="Overdue (5+ days)"
            value={String(data.followupsOverdueCount)}
          />
        </div>
      </Section>
      {data.managerWeeklySnapshot && (
        <Section title="My latest weekly snapshot">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label="Lead → reservation"
              value={`${data.managerWeeklySnapshot.leadToReservationRate ?? "—"}%`}
            />
            <MetricCard
              label="Avg response (min)"
              value={data.managerWeeklySnapshot.averageResponseTimeMinutes ?? "—"}
            />
            <MetricCard
              label="AI quality score"
              value={data.managerWeeklySnapshot.aiQualityScore ?? "—"}
            />
          </div>
        </Section>
      )}
      <Section title="Top hot leads">
        {data.topHotLeads.length === 0 ? (
          <EmptyState title="No hot leads" description="All quiet on the pipeline front." />
        ) : (
          <ul className="text-sm space-y-1">
            {data.topHotLeads.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between border-b border-line-soft py-2"
              >
                <span className="font-mono text-xs">{l.leadCode}</span>
                <Badge tone="warning">{l.lifecycleStatus}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </DevelopmentShell>
  );
}
