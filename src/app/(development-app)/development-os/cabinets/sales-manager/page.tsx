import type { Metadata } from "next";
import Link from "next/link";
import {
  CabinetGreetingBlock,
  DashboardKpi,
  NoItemsYet,
  PageHeaderHero,
} from "@/components/ui/primitives";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { loadSalesCabinet } from "@/lib/development/server/cabinets/sales-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Stage 10.5.A.3.1 — Sales Manager cabinet (replatformed).
 *
 * Layout follows the pattern doc shipped in 10.5.A.1.4. Per-manager
 * (queries take `me.id`) so different managers see different pipelines
 * — RLS happens at the leads / sales_conversation_threads layer.
 *
 * KPI mapping:
 *   - Hot leads             → hotLeadsCount
 *   - Active conversations  → activeConversationsCount
 *   - Reservations (MTD)    → reservationsThisMonth
 *   - Overdue follow-ups    → followupsOverdueCount  (status bad when > 0)
 *
 * Side panel: top 5 hot leads (clickable), plus weekly performance
 * snapshot from manager_performance_metrics when present.
 */

export const metadata: Metadata = { title: "Sales manager · Cabinet" };
export const dynamic = "force-dynamic";

export default async function SalesManagerCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("sales-manager");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  if (!me) {
    return (
      <DevelopmentShell>
        <div className="flex flex-col gap-8">
          <PageHeaderHero
            eyebrow="Sales manager"
            title="Sign in to see your pipeline"
            description="Per-manager dashboard. Log in to load your leads, conversations, and follow-ups."
          />
        </div>
      </DevelopmentShell>
    );
  }

  const data = await safeQuery("salesCabinet", loadSalesCabinet(me.id), {
    hotLeadsCount: 0,
    activeConversationsCount: 0,
    reservationsThisMonth: 0,
    contractsThisMonth: 0,
    followupsOverdueCount: 0,
    managerWeeklySnapshot: null,
    topHotLeads: [],
  });

  const overdueStatus =
    data.followupsOverdueCount === 0
      ? "good"
      : data.followupsOverdueCount > 5
        ? "bad"
        : "warn";

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-10">
        <CabinetGreetingBlock
          firstName={firstName}
          eyebrow="Sales manager · Cabinet"
          subline={`${data.hotLeadsCount} hot lead${data.hotLeadsCount === 1 ? "" : "s"} · ${data.followupsOverdueCount} overdue follow-up${data.followupsOverdueCount === 1 ? "" : "s"}`}
          badge={
            data.followupsOverdueCount > 0 ? (
              <Badge tone="danger">{data.followupsOverdueCount} overdue</Badge>
            ) : null
          }
        />

        <PageHeaderHero
          eyebrow="This week"
          title="Your pipeline"
          description="Hot leads, active conversations, follow-ups, and your latest performance snapshot."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardKpi
            variant="hero"
            tone="emerald-soft"
            label="Hot leads"
            value={String(data.hotLeadsCount)}
            status={data.hotLeadsCount > 0 ? "good" : "neutral"}
            drillHref="/development-os/marketing/leads?lifecycle=hot&assigned=me"
            hint="Lifecycle status hot, assigned to you"
            className="sm:col-span-2 lg:col-span-2"
          />
          <DashboardKpi
            label="Active conversations"
            value={String(data.activeConversationsCount)}
            status="neutral"
            drillHref="/development-os/sales/conversations"
            hint="Open or on hold"
          />
          <DashboardKpi
            label="Reservations (MTD)"
            value={String(data.reservationsThisMonth)}
            status={data.reservationsThisMonth === 0 ? "warn" : "good"}
            drillHref="/development-os/marketing/leads?lifecycle=reservation"
            hint="Lifecycle changed this month"
          />
          <DashboardKpi
            label="Overdue follow-ups"
            value={String(data.followupsOverdueCount)}
            status={overdueStatus}
            drillHref="/development-os/sales/conversations?stale=true"
            hint="No reply for 5+ days"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Section eyebrow="Performance" title="My weekly snapshot">
              {data.managerWeeklySnapshot ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <DashboardKpi
                    label="Lead → reservation"
                    value={`${data.managerWeeklySnapshot.leadToReservationRate ?? "—"}`}
                    unit="%"
                    status="neutral"
                  />
                  <DashboardKpi
                    label="Avg response"
                    value={data.managerWeeklySnapshot.averageResponseTimeMinutes ?? "—"}
                    unit="min"
                    status="neutral"
                  />
                  <DashboardKpi
                    label="AI quality score"
                    value={data.managerWeeklySnapshot.aiQualityScore ?? "—"}
                    status={
                      data.managerWeeklySnapshot.aiQualityScore !== null &&
                      Number(data.managerWeeklySnapshot.aiQualityScore) >= 80
                        ? "good"
                        : "neutral"
                    }
                  />
                </div>
              ) : (
                <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                  No weekly snapshot yet. Snapshots populate from the
                  manager-performance cron.
                </div>
              )}
            </Section>

            <Section eyebrow="Contracts" title="This month">
              <DashboardKpi
                label="Contracts (MTD)"
                value={String(data.contractsThisMonth)}
                status="neutral"
                drillHref="/development-os/marketing/leads?lifecycle=contract"
                hint="Lifecycle changed this month"
              />
            </Section>
          </div>

          <aside className="flex flex-col gap-4">
            <Section eyebrow="Pipeline" title="Top hot leads">
              {data.topHotLeads.length === 0 ? (
                <NoItemsYet
                  entityLabel="hot leads"
                  description="All quiet on the pipeline front. New leads will appear here as they arrive."
                />
              ) : (
                <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                  {data.topHotLeads.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/development-os/marketing/leads/${l.id}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover"
                      >
                        <span className="font-mono text-xs text-ink">
                          {l.leadCode}
                        </span>
                        <Badge
                          tone={
                            l.lifecycleStatus === "hot" ? "warning" : "neutral"
                          }
                        >
                          {l.lifecycleStatus}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex justify-end">
                <Link
                  href="/development-os/marketing/leads?assigned=me"
                  className="text-xs text-ink-tertiary hover:underline"
                >
                  All my leads →
                </Link>
              </div>
            </Section>
          </aside>
        </div>
      </div>
    </DevelopmentShell>
  );
}
