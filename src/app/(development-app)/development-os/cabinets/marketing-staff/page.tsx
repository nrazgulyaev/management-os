import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarPlus,
  Inbox,
  Sparkles,
} from "lucide-react";
import { DashboardKpi, DonutRatioCard } from "@/components/ui/primitives";
import {
  HatchedBarChart,
  HeroGreetingAI,
  KpiRowMixed,
  LeadFunnelChart,
  type FunnelStage,
  type HatchedBarDatum,
  type KpiItem,
} from "@/components/award";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadMarketingCabinet } from "@/lib/development/server/cabinets/marketing-cabinet-queries";
import {
  loadChannelSplit,
  loadTopAttributedSource,
} from "@/lib/development/server/marketing/attribution-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Mega-Sprint / Phase 7 — Marketing Staff cabinet on Sprint-4 gold
 * standard. Replaces the Stage-10.5.A.2.4 CabinetGreetingBlock +
 * PageHeaderHero stack with <HeroGreetingAI>, swaps the headline KPI
 * grid for <KpiRowMixed> with a coral-solid hero (Content scheduled
 * this week), adds a Today's-pulse hatched-bar of daily publish
 * cadence, consumes the Phase-2 <LeadFunnelChart> primitive to
 * surface the cross-channel lead funnel, and renders a real inline
 * 3-card grid of recent marketing-assistant outputs.
 */

export const metadata: Metadata = { title: "Marketing staff · Cabinet" };
export const dynamic = "force-dynamic";

const FUNNEL_ORDER: Array<{ status: string; label: string }> = [
  { status: "new", label: "New leads" },
  { status: "qualified", label: "Qualified" },
  { status: "hot", label: "Hot" },
  { status: "reservation", label: "Reservation" },
  { status: "contract", label: "Contract" },
];

function todayLabel(now: Date): string {
  const day = now.getDate();
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `${day} · ${weekday}, ${month}`;
}

function bucketLast7Days(
  rows: Array<{ isoDate: string; count: number }>,
  today: Date,
): HatchedBarDatum[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.isoDate, r.count);
  const out: HatchedBarDatum[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const n = counts.get(iso) ?? 0;
    out.push({
      label: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      value: Math.max(n, 1),
      status: n > 0 ? "active" : "inactive",
      caption: n > 0 ? String(n) : undefined,
    });
  }
  return out;
}

function buildFunnelStages(
  rows: Array<{ lifecycleStatus: string; count: number }>,
): FunnelStage[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.lifecycleStatus.toLowerCase(), r.count);
  return FUNNEL_ORDER.map((s) => ({
    label: s.label,
    count: counts.get(s.status) ?? 0,
  }));
}

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
    publishesLast7Days: [],
    funnelByLifecycle: [],
    recentMarketingAssistantOutputs: [],
  });

  const now = new Date();
  const dailyPublishes = bucketLast7Days(data.publishesLast7Days, now);
  const funnelStages = buildFunnelStages(data.funnelByLifecycle);
  const statusEntries = Object.entries(data.contentByStatus).sort(
    (a, b) => b[1] - a[1],
  );

  // Sprint MD-4 Phase 2 — attribution + channel-split aggregators.
  const [topSource, channelSplit] = await Promise.all([
    safeQuery(
      "marketingTopAttribution",
      loadTopAttributedSource({}),
      null as Awaited<ReturnType<typeof loadTopAttributedSource>>,
    ),
    safeQuery(
      "marketingChannelSplit",
      loadChannelSplit({}),
      [] as Awaited<ReturnType<typeof loadChannelSplit>>,
    ),
  ]);
  const topChannelPublishCount = channelSplit.reduce(
    (acc, r) => acc + r.publishCount,
    0,
  );
  const topChannel =
    channelSplit.length > 0 ? channelSplit[0] : null;

  const kpis: KpiItem[] = [
    {
      label: "Scheduled this week",
      value: String(data.scheduledThisWeekCount),
      delta:
        data.scheduledThisWeekCount === 0
          ? "Calendar is open"
          : "Publishes within 7d",
      href: "/development-os/marketing/content?status=scheduled",
    },
    {
      label: "Leads this week",
      value: String(data.leadsThisWeek),
      delta:
        data.leadsThisWeek === 0
          ? "No new inbound"
          : "Created in last 7d",
      href: "/development-os/marketing/leads",
    },
    {
      label: "Approval queue",
      value: String(data.contentApprovalQueueCount),
      delta:
        data.contentApprovalQueueCount === 0
          ? "Inbox clear"
          : "Awaiting review",
      href: "/development-os/marketing/content?status=pending_review",
    },
    topSource
      ? {
          label: "Top attributed source",
          value: topSource.sourceLabel,
          delta: `${topSource.conversionCount} conv · ${topSource.conversionRate}% rate`,
          href: "/development-os/marketing/attribution",
        }
      : {
          label: "Active campaigns",
          value: String(data.activeCampaignsCount),
          delta:
            data.activeCampaignsCount === 0
              ? "None running"
              : "Currently active",
          href: "/development-os/marketing/campaigns?status=active",
        },
  ];

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8 md:gap-10">
        <HeroGreetingAI
          firstName={firstName}
          role="Marketing Staff · Cabinet"
          dateLabel={todayLabel(now)}
          aiPromptPlaceholder="Draft an Instagram caption or reply to inbound."
          showMyTasksHref="/development-os/marketing/content"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            {
              href: "/development-os/marketing/content/new",
              icon: CalendarPlus,
              label: "Schedule content",
              caption: `${data.scheduledThisWeekCount} queued this week`,
            },
            {
              href: "/development-os/marketing/content?status=pending_review",
              icon: Inbox,
              label: "Approval queue",
              caption:
                data.contentApprovalQueueCount > 0
                  ? `${data.contentApprovalQueueCount} pending`
                  : "Inbox clear",
            },
            {
              href: "/development-os/ai-agents/marketing-assistant",
              icon: Sparkles,
              label: "AI marketing assistant",
              caption: "Drafts · captions · replies",
            },
          ].map(({ href, icon: Icon, label, caption }) => (
            <Link
              key={href}
              href={href}
              className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
            >
              <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-coral-soft border border-line-soft inline-flex items-center justify-center">
                <Icon className="w-4 h-4 text-ink" strokeWidth={1.75} />
              </span>
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium text-ink truncate">
                  {label}
                </span>
                <span className="text-xs text-ink-tertiary truncate">
                  {caption}
                </span>
              </span>
              <ArrowUpRight
                className="w-4 h-4 text-ink-tertiary shrink-0"
                strokeWidth={1.75}
              />
            </Link>
          ))}
        </div>

        <KpiRowMixed kpis={kpis} heroTone="coral-solid" />

        <Section
          eyebrow="Today's pulse"
          title="Publish cadence"
          description="Pieces published per day across all channels over the last 7 days."
        >
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                Last 7 days
              </span>
              <span className="text-xs text-ink-tertiary tabular-nums">
                {data.recentlyPublishedCount} published · {data.hotLeadsCount}{" "}
                hot leads
              </span>
            </div>
            <HatchedBarChart
              data={dailyPublishes}
              tone="terracotta"
              height={200}
            />
          </div>
        </Section>

        <Section
          eyebrow="Funnel"
          title="Lead pipeline"
          description="Counts by lifecycle stage across all leads. Conversion-% chips reflect previous-stage carry-through."
          action={
            <Link
              href="/development-os/marketing/leads"
              className="text-xs text-ink-tertiary hover:underline"
            >
              All leads →
            </Link>
          }
        >
          <LeadFunnelChart stages={funnelStages} height={300} />
        </Section>

        {channelSplit.length > 0 && topChannel && (
          <Section
            eyebrow="Channels"
            title="Channel split (published content)"
            description="Share of published variants by platform target. Top channel donut + per-channel breakdown beneath."
          >
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 md:gap-5">
              <DonutRatioCard
                title={`Top channel · ${topChannel.channel}`}
                numerator={topChannel.publishCount}
                denominator={topChannelPublishCount}
                tone={topChannel.tone}
                caption={`${topChannel.publishCount} of ${topChannelPublishCount} variants on ${topChannel.channel}`}
              />
              <ul className="rounded-3xl border border-line-soft bg-surface shadow-soft-card divide-y divide-line-soft">
                {channelSplit.map((c) => (
                  <li
                    key={c.channel}
                    className="px-5 py-3 flex items-center justify-between gap-3"
                  >
                    <span className="text-sm font-medium text-ink capitalize">
                      {c.channel}
                    </span>
                    <span className="text-xs text-ink-secondary font-mono tabular-nums">
                      {c.publishCount} · {c.shareOfTotal}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        )}

        <Section
          eyebrow="AI"
          title="Marketing assistant — recent drafts"
          description="Latest content drafts + reply suggestions from the marketing-assistant agent."
          action={
            <Link
              href="/development-os/ai-agents/marketing-assistant"
              className="text-xs text-ink-tertiary hover:underline"
            >
              Open agent →
            </Link>
          }
        >
          {data.recentMarketingAssistantOutputs.length === 0 ? (
            <div className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                Recent drafts
              </span>
              <p className="text-sm leading-relaxed opacity-90">
                No outputs yet. Trigger the marketing-assistant agent
                from Jobs or via the AI prompt above to surface caption
                drafts + reply suggestions here.
              </p>
              <Badge tone="outline" className="self-start">
                Run the agent to populate
              </Badge>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              {data.recentMarketingAssistantOutputs.map((o) => (
                <Link
                  key={o.outputCode}
                  href={`/development-os/ai-agents/marketing-assistant/outputs/${o.outputCode}`}
                  className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3 hover:bg-muted/40 transition-colors min-h-[180px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
                      {o.outputCode}
                    </span>
                    <ArrowUpRight
                      className="w-4 h-4 text-ink-tertiary"
                      strokeWidth={1.75}
                    />
                  </div>
                  <h4 className="text-sm font-medium text-ink line-clamp-2">
                    {o.title}
                  </h4>
                  <p className="text-xs text-ink-secondary leading-relaxed line-clamp-4">
                    {o.summary}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Section
              eyebrow="Breakdown"
              title="Content by status"
              description="Sorted by count descending. Click through to filter the content library."
            >
              {statusEntries.length === 0 ? (
                <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                  No content yet. Drafts surface here as they&rsquo;re
                  created.
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

          <aside>
            <Section
              eyebrow="Pipeline"
              title="Content this week"
              description="Snapshot KPIs for scheduled / published / approval pieces."
            >
              <div className="grid grid-cols-1 gap-3">
                <DashboardKpi
                  label="Scheduled"
                  value={String(data.scheduledThisWeekCount)}
                  status="neutral"
                  drillHref="/development-os/marketing/content?status=scheduled"
                />
                <DashboardKpi
                  label="Published (7d)"
                  value={String(data.recentlyPublishedCount)}
                  status={
                    data.recentlyPublishedCount === 0 ? "warn" : "good"
                  }
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
          </aside>
        </div>
      </div>
    </DevelopmentShell>
  );
}
