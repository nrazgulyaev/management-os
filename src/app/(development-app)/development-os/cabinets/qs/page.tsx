import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FileSpreadsheet, GitBranch, Sparkles } from "lucide-react";
import { DashboardKpi, NoItemsYet } from "@/components/ui/primitives";
import {
  HatchedBarChart,
  HeroGreetingAI,
  KpiRowMixed,
  type HatchedBarDatum,
  type KpiItem,
} from "@/components/award";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadQsCabinet } from "@/lib/development/server/cabinets/qs-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Mega-Sprint / Phase 4 — QS / Cost Analyst cabinet on Sprint-4 gold
 * standard. Replaces the Stage-10.5.A.2.2 CabinetGreetingBlock +
 * PageHeaderHero stack with <HeroGreetingAI>, swaps the headline KPI
 * grid for <KpiRowMixed> with a gold-solid hero (BoQs under review),
 * adds a Today's-pulse hatched-bar of qs-cost-analyst anomalies, and
 * renders a real inline 3-card grid of recent agent outputs. BoQ
 * quick-entry route at /development-os/boq/quick-entry is deferred
 * (audit §D2: 0.5-day follow-up).
 */

export const metadata: Metadata = { title: "QS / Cost analyst · Cabinet" };
export const dynamic = "force-dynamic";

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

export default async function QsCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("qs");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const data = await safeQuery("qsCabinet", loadQsCabinet(), {
    activeBoqCount: 0,
    recentBoqs: [],
    latestQsAnalystOutputCode: null,
    awaitingQsAnalysisCount: 0,
    recentSpecificationsCount: 0,
    boqsUnderReviewCount: 0,
    openChangeOrdersCount: 0,
    anomaliesThisWeekCount: 0,
    anomaliesLast7Days: [],
    recentQsAnalystOutputs: [],
  });

  const now = new Date();
  const dailyAnomalies = bucketLast7Days(data.anomaliesLast7Days, now);

  const kpis: KpiItem[] = [
    {
      label: "BoQs under review",
      value: String(data.boqsUnderReviewCount),
      delta:
        data.boqsUnderReviewCount === 0
          ? "Queue clear"
          : `${data.boqsUnderReviewCount} pending QS pass`,
      href: "/development-os/boq",
    },
    {
      label: "Active BoQs",
      value: String(data.activeBoqCount),
      delta: "Across all projects",
      href: "/development-os/boq",
    },
    {
      label: "Open change orders",
      value: String(data.openChangeOrdersCount),
      delta:
        data.openChangeOrdersCount === 0
          ? "No variations"
          : "Scope deltas waiting",
      href: "/development-os/change-orders",
    },
    {
      label: "AI anomalies (7d)",
      value: String(data.anomaliesThisWeekCount),
      delta:
        data.anomaliesThisWeekCount === 0
          ? "No flags"
          : "Flagged this week",
      href: "/development-os/ai-agents/qs-cost-analyst",
    },
  ];

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8 md:gap-10">
        <HeroGreetingAI
          firstName={firstName}
          role="QS / Cost Analyst · Cabinet"
          dateLabel={todayLabel(now)}
          aiPromptPlaceholder="Run anomaly analysis on a BoQ or compare unit costs."
          showMyTasksHref="/development-os/boq"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            {
              href: "/development-os/boq",
              icon: FileSpreadsheet,
              label: "Review BoQ",
              caption: `${data.boqsUnderReviewCount} under review`,
            },
            {
              href: "/development-os/change-orders",
              icon: GitBranch,
              label: "Change orders",
              caption:
                data.openChangeOrdersCount > 0
                  ? `${data.openChangeOrdersCount} open`
                  : "No variations",
            },
            {
              href: "/development-os/ai-agents/qs-cost-analyst",
              icon: Sparkles,
              label: "AI cost analyst",
              caption: "Unit-cost anomalies",
            },
          ].map(({ href, icon: Icon, label, caption }) => (
            <Link
              key={href}
              href={href}
              className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
            >
              <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-gold-soft border border-line-soft inline-flex items-center justify-center">
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

        <KpiRowMixed kpis={kpis} heroTone="gold-solid" />

        <Section
          eyebrow="Today's pulse"
          title="Cost-anomaly cadence"
          description="Daily qs-cost-analyst outputs across all projects over the last 7 days. Spikes flag unit-cost outliers."
        >
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                Last 7 days
              </span>
              <span className="text-xs text-ink-tertiary tabular-nums">
                {data.anomaliesThisWeekCount} anomalies
              </span>
            </div>
            <HatchedBarChart data={dailyAnomalies} tone="gold" height={200} />
          </div>
        </Section>

        <Section
          eyebrow="AI"
          title="QS cost analyst — recent outputs"
          description="Latest unit-cost-anomaly + variance analyses from the qs-cost-analyst agent."
          action={
            <Link
              href="/development-os/ai-agents/qs-cost-analyst"
              className="text-xs text-ink-tertiary hover:underline"
            >
              Open agent →
            </Link>
          }
        >
          {data.recentQsAnalystOutputs.length === 0 ? (
            <div className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                Recent runs
              </span>
              <p className="text-sm leading-relaxed opacity-90">
                No outputs yet. Trigger the qs-cost-analyst agent from
                Jobs or via the AI prompt above to surface unit-cost
                anomalies, missing categorizations, and variance flags.
              </p>
              <Badge tone="outline" className="self-start">
                Run the agent to populate
              </Badge>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              {data.recentQsAnalystOutputs.map((o) => (
                <Link
                  key={o.outputCode}
                  href={`/development-os/ai-agents/qs-cost-analyst/outputs/${o.outputCode}`}
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
              eyebrow="Documents"
              title="Recent BoQs"
              description="Latest bill-of-quantities documents across all projects."
            >
              {data.recentBoqs.length === 0 ? (
                <NoItemsYet
                  entityLabel="BOQs"
                  description="Create your first BoQ document to start tracking quantities."
                />
              ) : (
                <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                  {data.recentBoqs.map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/development-os/boq/${b.id}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover"
                      >
                        <span className="text-sm text-ink truncate">
                          {b.title}
                        </span>
                        <Badge
                          tone={
                            b.status === "under_review"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {b.status}
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
              eyebrow="Cross-cabinet"
              title="Related surfaces"
            >
              <ul className="grid grid-cols-1 gap-2">
                {[
                  {
                    href: "/development-os/procurement/quotation-comparison",
                    label: "Quotation comparison",
                  },
                  {
                    href: "/development-os/specifications",
                    label: "Specifications library",
                  },
                  {
                    href: "/development-os/finance/payables",
                    label: "Payables",
                  },
                ].map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="block rounded-md border border-line-soft bg-surface px-4 py-3 text-sm text-ink hover:border-line-strong transition-colors"
                    >
                      {l.label} <span aria-hidden>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <DashboardKpi
                label="Specs added (30d)"
                value={String(data.recentSpecificationsCount)}
                status={
                  data.recentSpecificationsCount === 0 ? "warn" : "neutral"
                }
                drillHref="/development-os/specifications"
                className="mt-3"
              />
              <DashboardKpi
                label="Latest analysis"
                value={data.latestQsAnalystOutputCode ?? "—"}
                status={data.latestQsAnalystOutputCode ? "good" : "neutral"}
                drillHref={
                  data.latestQsAnalystOutputCode
                    ? `/development-os/ai-agents/qs-cost-analyst/outputs/${data.latestQsAnalystOutputCode}`
                    : "/development-os/ai-agents/qs-cost-analyst"
                }
                hint="qs-cost-analyst"
                className="mt-3"
              />
            </Section>
          </aside>
        </div>
      </div>
    </DevelopmentShell>
  );
}
