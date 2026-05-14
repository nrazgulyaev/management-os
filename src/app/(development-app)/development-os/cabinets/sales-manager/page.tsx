import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  MessageSquare,
  Sparkles,
  UserPlus,
} from "lucide-react";
import {
  DashboardKpi,
  NoItemsYet,
} from "@/components/ui/primitives";
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
import { getCurrentAppUser } from "@/features/auth/current-user";
import { loadSalesCabinet } from "@/lib/development/server/cabinets/sales-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Mega-Sprint / Phase 2 — Sales Manager cabinet on Sprint-4 gold
 * standard. Replaces the Stage-10.5.A.3.1 CabinetGreetingBlock +
 * PageHeaderHero stack with <HeroGreetingAI>, swaps the headline KPI
 * grid for <KpiRowMixed>, adds a "Today's pulse" row
 * (HatchedBarChart of 7-day conversation cadence + the manager's
 * weekly snapshot card), and surfaces the new <LeadFunnelChart>
 * primitive as the pipeline visual. AI insight card points operators
 * at the marketing-assistant agent for draft follow-ups.
 */

export const metadata: Metadata = { title: "Sales manager · Cabinet" };
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

function conversationsLast7Days(
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
  for (const r of rows) {
    counts.set(r.lifecycleStatus.toLowerCase(), r.count);
  }
  return FUNNEL_ORDER.map((s) => ({
    label: s.label,
    count: counts.get(s.status) ?? 0,
  }));
}

export default async function SalesManagerCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("sales-manager");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  if (!me) {
    return (
      <DevelopmentShell>
        <div className="flex flex-col gap-8">
          <HeroGreetingAI
            firstName={null}
            role="Sales Manager · Cabinet"
            aiPromptPlaceholder="Sign in to load your pipeline."
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
    funnelByLifecycle: [],
    conversationsLast7Days: [],
  });

  const now = new Date();
  const overdueStatus =
    data.followupsOverdueCount === 0
      ? "good"
      : data.followupsOverdueCount > 5
        ? "bad"
        : "warn";

  const kpis: KpiItem[] = [
    {
      label: "Hot leads",
      value: String(data.hotLeadsCount),
      delta:
        data.hotLeadsCount === 0
          ? "Pipeline is quiet"
          : `${data.hotLeadsCount} need a reply`,
      href: "/development-os/marketing/leads?lifecycle=hot&assigned=me",
    },
    {
      label: "Reservations (MTD)",
      value: String(data.reservationsThisMonth),
      delta:
        data.reservationsThisMonth === 0
          ? "None this month"
          : `${data.reservationsThisMonth} this month`,
      href: "/development-os/marketing/leads?lifecycle=reservation",
    },
    {
      label: "Contracts (MTD)",
      value: String(data.contractsThisMonth),
      delta:
        data.contractsThisMonth === 0
          ? "Close one this month"
          : `${data.contractsThisMonth} closed`,
      href: "/development-os/marketing/leads?lifecycle=contract",
    },
    {
      label: "Overdue follow-ups",
      value: String(data.followupsOverdueCount),
      delta:
        data.followupsOverdueCount === 0
          ? "All caught up"
          : "Stale 5+ days",
      href: "/development-os/sales/conversations?stale=true",
    },
  ];

  const funnelStages = buildFunnelStages(data.funnelByLifecycle);
  const dailyConversations = conversationsLast7Days(
    data.conversationsLast7Days,
    now,
  );

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8 md:gap-10">
        <HeroGreetingAI
          firstName={firstName}
          role="Sales Manager · Cabinet"
          dateLabel={todayLabel(now)}
          aiPromptPlaceholder="Ask the marketing-assistant to draft a follow-up."
          showMyTasksHref="/development-os/sales/conversations"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            {
              href: "/development-os/marketing/leads/new",
              icon: UserPlus,
              label: "Capture new lead",
              caption: "Manual entry · imports",
            },
            {
              href: "/development-os/sales/conversations?stale=true",
              icon: MessageSquare,
              label: "Reply to overdue threads",
              caption:
                data.followupsOverdueCount > 0
                  ? `${data.followupsOverdueCount} waiting`
                  : "All caught up",
            },
            {
              href: "/development-os/ai-agents/marketing-assistant",
              icon: Sparkles,
              label: "AI follow-up drafter",
              caption: "Marketing assistant",
            },
          ].map(({ href, icon: Icon, label, caption }) => (
            <Link
              key={href}
              href={href}
              className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
            >
              <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-emerald-soft border border-line-soft inline-flex items-center justify-center">
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

        <KpiRowMixed kpis={kpis} heroTone="emerald-solid" />

        <Section
          eyebrow="Today's pulse"
          title="Conversation cadence"
          description="Reply activity across your assigned threads over the last 7 days, alongside this week's manager-performance snapshot."
        >
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-5">
            <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                  Last 7 days
                </span>
                <span className="text-xs text-ink-tertiary tabular-nums">
                  {data.activeConversationsCount} active threads
                </span>
              </div>
              <HatchedBarChart
                data={dailyConversations}
                tone="emerald"
                height={200}
              />
            </div>
            <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-4">
              <div>
                <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                  Weekly snapshot
                </span>
                <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink mt-1">
                  Manager performance
                </h3>
              </div>
              {data.managerWeeklySnapshot ? (
                <div className="grid grid-cols-1 gap-3">
                  <DashboardKpi
                    label="Lead → reservation"
                    value={`${data.managerWeeklySnapshot.leadToReservationRate ?? "—"}`}
                    unit="%"
                    status="neutral"
                  />
                  <DashboardKpi
                    label="Avg response"
                    value={
                      data.managerWeeklySnapshot.averageResponseTimeMinutes ??
                      "—"
                    }
                    unit="min"
                    status="neutral"
                  />
                  <DashboardKpi
                    label="AI quality"
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
                <p className="text-sm text-ink-secondary">
                  No weekly snapshot yet. Snapshots populate from the
                  manager-performance cron.
                </p>
              )}
            </div>
          </div>
        </Section>

        <Section
          eyebrow="Pipeline"
          title="Lead funnel"
          description="Counts by lifecycle stage across leads assigned to you. Conversion-% chips between stages reflect the previous-stage carry-through."
          action={
            <Link
              href="/development-os/marketing/leads?assigned=me"
              className="text-xs text-ink-tertiary hover:underline"
            >
              All my leads →
            </Link>
          }
        >
          <LeadFunnelChart stages={funnelStages} height={300} />
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Section
              eyebrow="Pipeline"
              title="Top hot leads"
              description="Your five most-recent hot or qualified leads."
            >
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
                            l.lifecycleStatus === "hot"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {l.lifecycleStatus}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <aside>
            <Section
              eyebrow="Overdue"
              title="Follow-up status"
              description="Threads with no reply for 5+ days."
            >
              <DashboardKpi
                label="Overdue follow-ups"
                value={String(data.followupsOverdueCount)}
                status={overdueStatus}
                drillHref="/development-os/sales/conversations?stale=true"
                hint="No reply for 5+ days"
              />
            </Section>
          </aside>
        </div>

        <Section
          eyebrow="AI"
          title="Marketing assistant"
          description="Draft polite follow-ups, qualify replies, and prep contract handoffs."
          action={
            <Link
              href="/development-os/ai-agents/marketing-assistant"
              className="text-xs text-ink-tertiary hover:underline"
            >
              Open agent →
            </Link>
          }
        >
          <div className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
              Recent drafts
            </span>
            <p className="text-sm leading-relaxed opacity-90">
              The marketing-assistant agent drafts personalised follow-up
              messages for overdue threads and suggests next-step
              qualifying questions. Open the agent surface above to review
              the latest drafts and send them out.
            </p>
            <Badge tone="outline" className="self-start">
              Inline draft list coming in a polish pass
            </Badge>
          </div>
        </Section>
      </div>
    </DevelopmentShell>
  );
}
