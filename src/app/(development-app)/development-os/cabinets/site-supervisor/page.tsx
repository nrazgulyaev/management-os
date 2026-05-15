import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Camera,
  Sparkles,
} from "lucide-react";
import {
  DashboardKpi,
  NoItemsYet,
} from "@/components/ui/primitives";
import {
  HatchedBarChart,
  HalfDonutGauge,
  HeroGreetingAI,
  KpiRowMixed,
  PatrolTimeline,
  type HatchedBarDatum,
  type KpiItem,
  type PatrolEvent,
} from "@/components/award";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { loadSiteSupervisorCabinet } from "@/lib/development/server/cabinets/site-supervisor-cabinet-queries";
import {
  loadDailyDigestOutputs,
  type DailyDigestOutput,
} from "@/lib/development/server/ai/daily-digest-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Mega-Sprint / Phase 1 — Site Supervisor cabinet on Sprint-4 gold
 * standard. Replaces the Stage-10.5.A.2.1 CabinetGreetingBlock +
 * PageHeaderHero stack with <HeroGreetingAI>, adds a KpiRowMixed
 * row above the existing snapshot KPIs, adds a Today's-pulse row
 * (HatchedBarChart for 7-day report cadence + HalfDonutGauge for
 * today's checklist completion), and surfaces the new
 * <PatrolTimeline> primitive for ground-level activity (site
 * reports + incidents). Existing recent-reports aside preserved as
 * fallback content.
 */

export const metadata: Metadata = { title: "Site supervisor · Cabinet" };
export const dynamic = "force-dynamic";

function todayLabel(now: Date): string {
  const day = now.getDate();
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `${day} · ${weekday}, ${month}`;
}

/**
 * Phase 1 — bucket recent report dates into the 7 calendar-day grid
 * the HatchedBarChart consumes. Days with at least one report ship
 * as solid bars; empty days as hatched (track-only).
 */
function reportsLast7Days(
  recentReports: { reportDate: string }[],
  today: Date,
): HatchedBarDatum[] {
  const counts = new Map<string, number>();
  for (const r of recentReports) {
    counts.set(r.reportDate, (counts.get(r.reportDate) ?? 0) + 1);
  }
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

export default async function SiteSupervisorCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("site-supervisor");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;
  const data = me
    ? await safeQuery(
        "siteSupervisorCabinet",
        loadSiteSupervisorCabinet(me.id),
        {
          todaysSiteReportCount: 0,
          openQaQcAssignedToMe: 0,
          materialsExpectedToday: 0,
          yesterdayPhotoCount: 0,
          yesterdayWorkforceRecorded: 0,
          recentReports: [],
        },
      )
    : null;

  // Sprint MD-3.A — Load the 3 most-recent daily-construction-digest
  // outputs for the inline AI grid that replaces the Phase-1 placeholder.
  const digests = me
    ? await safeQuery(
        "siteSupervisorDailyDigest",
        loadDailyDigestOutputs({ limit: 3 }),
        [] as DailyDigestOutput[],
      )
    : [];

  const now = new Date();
  const dailyCounts = data ? reportsLast7Days(data.recentReports, now) : [];

  const kpis: KpiItem[] = data
    ? [
        {
          label: "Reports today",
          value: String(data.todaysSiteReportCount),
          delta:
            data.todaysSiteReportCount === 0
              ? "None yet — file the first"
              : `${data.todaysSiteReportCount} filed`,
          href: "/development-os/site-reports",
        },
        {
          label: "Open QA / QC (mine)",
          value: String(data.openQaQcAssignedToMe),
          delta:
            data.openQaQcAssignedToMe === 0
              ? "All clear"
              : `${data.openQaQcAssignedToMe} assigned`,
          href: "/development-os/qa-qc",
        },
        {
          label: "Workforce yesterday",
          value: String(data.yesterdayWorkforceRecorded),
          delta: "Logged entries",
          href: "/development-os/site-reports",
        },
        {
          label: "Photos yesterday",
          value: String(data.yesterdayPhotoCount),
          delta:
            data.yesterdayPhotoCount === 0
              ? "Capture today's progress"
              : "Daily progress capture",
          href: "/development-os/site-reports",
        },
      ]
    : [];

  // Today's checklist completion is approximated from open QA/QC vs
  // an assumed daily target of 5 items. Real target would come from
  // a cron-populated snapshot in a future polish pass.
  const dailyTarget = 5;
  const completedToday = Math.max(
    0,
    dailyTarget - (data?.openQaQcAssignedToMe ?? 0),
  );
  const completionPct =
    dailyTarget > 0
      ? Math.round((completedToday / dailyTarget) * 100)
      : 0;

  // Translate recent reports into PatrolTimeline events. The Phase-1
  // version uses the report's `reportDate` as the timestamp and the
  // ID prefix as the title; richer event metadata (workforce-on-site
  // count + photo count per report) is a future polish task.
  const timelineEvents: PatrolEvent[] = (data?.recentReports ?? [])
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      timestamp: r.reportDate,
      status: "info",
      title: `Site report · ${r.id.slice(0, 8)}`,
      body: `Filed ${r.reportDate}`,
      kind: "check",
      href: `/development-os/site-reports/${r.id}`,
      statusLabel: "Filed",
    }));

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8 md:gap-10">
        <HeroGreetingAI
          firstName={firstName}
          role="Site Supervisor · Cabinet"
          dateLabel={todayLabel(now)}
          aiPromptPlaceholder="Ask the daily-construction-digest anything."
          showMyTasksHref="/development-os/site-reports"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            {
              href: "/development-os/site-reports/new",
              icon: Camera,
              label: "Quick photo · file report",
              caption: "Daily progress capture",
            },
            {
              href: "/development-os/qa-qc",
              icon: AlertTriangle,
              label: "Raise QA/QC issue",
              caption: data
                ? `${data.openQaQcAssignedToMe} assigned to me`
                : "—",
            },
            {
              href: "/development-os/ai-agents/daily-construction-digest",
              icon: Sparkles,
              label: "AI daily digest",
              caption: "Yesterday's exceptions",
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

        {!data ? (
          <NoItemsYet
            entityLabel="data"
            description="Sign in to see your site activity."
          />
        ) : (
          <>
            <KpiRowMixed kpis={kpis} heroTone="emerald-solid" />

            {/* Inventory + materials row (preserved from Stage 10.5.A) */}
            <Section
              eyebrow="Inventory"
              title="Materials expected today"
            >
              <DashboardKpi
                label="Deliveries on schedule"
                value={String(data.materialsExpectedToday)}
                status={
                  data.materialsExpectedToday === 0 ? "neutral" : "good"
                }
                drillHref="/development-os/inventory"
                hint="Material orders due today"
              />
            </Section>

            <Section
              eyebrow="Today's pulse"
              title="Field cadence"
              description="Days with site-report activity over the last 7 calendar days, plus today's QA/QC completion."
            >
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-5">
                <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                      Last 7 days
                    </span>
                    <span className="text-xs text-ink-tertiary tabular-nums">
                      {data.recentReports.length} recent reports
                    </span>
                  </div>
                  <HatchedBarChart
                    data={dailyCounts}
                    tone="emerald"
                    height={200}
                  />
                </div>
                <HalfDonutGauge
                  variant="emerald"
                  value={completionPct}
                  max={100}
                  label={
                    <>
                      <p className="text-display text-[28px] md:text-[36px] leading-none font-medium text-ink tabular-nums">
                        {completionPct}%
                      </p>
                      <p className="text-xs text-ink-tertiary mt-1">
                        Today's checklist
                      </p>
                    </>
                  }
                  legend={[
                    { label: `${completedToday} cleared` },
                    {
                      label: `${data.openQaQcAssignedToMe} open`,
                      color: "var(--line-strong)",
                    },
                  ]}
                />
              </div>
            </Section>

            <Section
              eyebrow="Activity"
              title="Recent on-site events"
              description="Site reports filed and photos captured. Click to open."
              action={
                <Link
                  href="/development-os/site-reports"
                  className="text-xs text-ink-tertiary hover:underline"
                >
                  All reports →
                </Link>
              }
            >
              {timelineEvents.length === 0 ? (
                <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 text-sm text-ink-tertiary">
                  No reports filed yet. Use the "Quick photo" action
                  above to file the first one.
                </div>
              ) : (
                <PatrolTimeline
                  events={timelineEvents}
                  maxVisible={6}
                  moreHref="/development-os/site-reports"
                />
              )}
            </Section>

            {/* Sprint MD-3.A — Inline 3-card grid of recent
                daily-construction-digest outputs. Replaces the
                Phase-1 placeholder. */}
            <Section
              eyebrow="AI"
              title="Daily construction digest"
              description="Yesterday's exceptions + today's plan from the daily-construction-digest agent."
              action={
                <Link
                  href="/development-os/ai-agents/daily-construction-digest"
                  className="text-xs text-ink-tertiary hover:underline"
                >
                  Open agent →
                </Link>
              }
            >
              {digests.length === 0 ? (
                <Link
                  href="/development-os/ai-agents/daily-construction-digest"
                  className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3 hover:opacity-95 transition-opacity"
                >
                  <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                    No runs yet
                  </span>
                  <p className="text-sm leading-relaxed opacity-90">
                    The daily-construction-digest agent runs nightly and
                    files an executive summary of yesterday's exceptions
                    + a plan for today. Trigger a run from the agent
                    surface to populate this grid.
                  </p>
                  <Badge tone="outline" className="self-start">
                    Run digest →
                  </Badge>
                </Link>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
                  {digests.map((d) => (
                    <Link
                      key={d.id}
                      href={`/development-os/ai-agents/daily-construction-digest/outputs/${d.outputCode}`}
                      className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3 hover:opacity-95 transition-opacity"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                          {new Date(d.createdAt).toLocaleDateString(
                            "en-US",
                            { day: "numeric", month: "short" },
                          )}
                          {d.projectName ? ` · ${d.projectName}` : ""}
                        </span>
                        <ArrowUpRight
                          className="w-3.5 h-3.5 opacity-80"
                          strokeWidth={1.75}
                        />
                      </div>
                      <p className="text-sm font-medium leading-snug line-clamp-2">
                        {d.title}
                      </p>
                      {d.latestExceptions.length > 0 && (
                        <ul className="flex flex-col gap-1.5 text-xs opacity-90 leading-relaxed">
                          {d.latestExceptions.slice(0, 3).map((ex, i) => (
                            <li
                              key={`${d.id}-ex-${i}`}
                              className="flex items-start gap-2"
                            >
                              <span
                                aria-hidden
                                className="inline-block w-1 h-1 mt-1.5 rounded-full bg-white/60 shrink-0"
                              />
                              <span className="line-clamp-2">{ex}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <span className="mt-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] opacity-80">
                        View digest
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </DevelopmentShell>
  );
}
