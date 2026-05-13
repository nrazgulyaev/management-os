import type { Metadata } from "next";
import Link from "next/link";
import {
  DashboardKpi,
  CabinetGreetingBlock,
  PageHeaderHero,
} from "@/components/ui/primitives";
import { Section } from "@/components/ui/section";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadMarketingCabinet } from "@/lib/development/server/cabinets/marketing-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Stage 10.5.A.2.4 — Marketing Staff cabinet (replatformed).
 *
 * Stays in Dev OS at /development-os/cabinets/marketing-staff (the
 * launch prompt referenced "Mgmt OS"; existing route + cabinet gating
 * lives in Dev OS — moving it would require changing
 * cabinet-definitions + the role landing-resolver. Decision
 * documented in tmp/stage-10-5-a-2-decisions.md).
 *
 * KPI mapping:
 *   - Hot leads             → hotLeadsCount       (good when 0 or many,
 *                                                  context-dependent —
 *                                                  treated as neutral)
 *   - Leads this week       → leadsThisWeek
 *   - Approval queue        → contentApprovalQueueCount
 *   - Active campaigns      → activeCampaignsCount
 *
 * Side surfaces:
 *   - Content pipeline breakdown by status (sub-KPI grid)
 *   - Cross-link panel to deeper marketing surfaces
 */

export const metadata: Metadata = { title: "Marketing staff · Cabinet" };
export const dynamic = "force-dynamic";

export default async function MarketingStaffCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("marketing-staff");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const data = await safeQuery("marketingCabinet", loadMarketingCabinet(), {
    contentByStatus: {},
    contentApprovalQueueCount: 0,
    scheduledThisWeekCount: 0,
    recentlyPublishedCount: 0,
    activeCampaignsCount: 0,
    leadsThisWeek: 0,
    hotLeadsCount: 0,
    latestMarketingAssistantOutputCode: null,
  });

  const statusEntries = Object.entries(data.contentByStatus).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-10">
        <CabinetGreetingBlock
          firstName={firstName}
          eyebrow="Marketing staff · Cabinet"
          subline={`${data.hotLeadsCount} hot lead${data.hotLeadsCount === 1 ? "" : "s"} · ${data.leadsThisWeek} new this week`}
        />

        <PageHeaderHero
          eyebrow="This week"
          title="Marketing performance"
          description="Leads this week, content pipeline, and campaign activity at a glance."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardKpi
            variant="hero"
            tone="gold-soft"
            label="Hot leads"
            value={String(data.hotLeadsCount)}
            status={data.hotLeadsCount > 0 ? "good" : "neutral"}
            drillHref="/development-os/marketing/leads?lifecycle=hot"
            hint="Lifecycle status hot"
            className="sm:col-span-2 lg:col-span-2"
          />
          <DashboardKpi
            label="Leads this week"
            value={String(data.leadsThisWeek)}
            status={data.leadsThisWeek === 0 ? "warn" : "neutral"}
            drillHref="/development-os/marketing/leads"
            hint="Created in last 7 days"
          />
          <DashboardKpi
            label="Approval queue"
            value={String(data.contentApprovalQueueCount)}
            status={
              data.contentApprovalQueueCount === 0
                ? "good"
                : data.contentApprovalQueueCount > 5
                  ? "bad"
                  : "warn"
            }
            drillHref="/development-os/marketing/content?status=pending_review"
            hint="Content awaiting review"
          />
          <DashboardKpi
            label="Active campaigns"
            value={String(data.activeCampaignsCount)}
            status="neutral"
            drillHref="/development-os/marketing/campaigns?status=active"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Section eyebrow="Pipeline" title="Content this week">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DashboardKpi
                  label="Scheduled"
                  value={String(data.scheduledThisWeekCount)}
                  status="neutral"
                  drillHref="/development-os/marketing/content?status=scheduled"
                  hint="Publishes within 7 days"
                />
                <DashboardKpi
                  label="Published (7d)"
                  value={String(data.recentlyPublishedCount)}
                  status={data.recentlyPublishedCount === 0 ? "warn" : "good"}
                  drillHref="/development-os/marketing/content?status=published"
                />
                <DashboardKpi
                  label="In approval"
                  value={String(data.contentApprovalQueueCount)}
                  status={
                    data.contentApprovalQueueCount === 0 ? "good" : "warn"
                  }
                  drillHref="/development-os/marketing/content?status=pending_review"
                />
              </div>
            </Section>

            <Section eyebrow="Breakdown" title="Content by status">
              {statusEntries.length === 0 ? (
                <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                  No content yet. Drafts surface here as they&rsquo;re created.
                </div>
              ) : (
                <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                  {statusEntries.map(([status, count]) => (
                    <li
                      key={status}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-sm text-ink capitalize">
                        {status.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-mono tabular-nums text-ink-secondary">
                        {count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <aside className="flex flex-col gap-4">
            <Section eyebrow="AI" title="Latest assistant">
              <div className="rounded-md border border-line-soft bg-surface p-5">
                <div className="text-label">Marketing assistant</div>
                {data.latestMarketingAssistantOutputCode ? (
                  <Link
                    href={`/development-os/ai-agents/marketing-assistant/outputs/${data.latestMarketingAssistantOutputCode}`}
                    className="text-sm text-info hover:underline"
                  >
                    {data.latestMarketingAssistantOutputCode} →
                  </Link>
                ) : (
                  <span className="text-sm text-ink-tertiary">
                    No output yet — run from{" "}
                    <Link
                      href="/development-os/jobs"
                      className="text-info hover:underline"
                    >
                      Jobs
                    </Link>
                    .
                  </span>
                )}
              </div>
            </Section>

            <Section eyebrow="Surfaces" title="Jump to">
              <ul className="grid grid-cols-1 gap-2">
                <CrossLink
                  href="/development-os/marketing/leads"
                  label="Leads"
                />
                <CrossLink
                  href="/development-os/marketing/content"
                  label="Content library"
                />
                <CrossLink
                  href="/development-os/marketing/campaigns"
                  label="Campaigns"
                />
                <CrossLink
                  href="/development-os/marketing/attribution"
                  label="Attribution"
                />
              </ul>
            </Section>
          </aside>
        </div>
      </div>
    </DevelopmentShell>
  );
}

function CrossLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-md border border-line-soft bg-surface px-4 py-3 text-sm text-ink hover:border-line-strong transition-colors"
      >
        {label} <span aria-hidden>→</span>
      </Link>
    </li>
  );
}
