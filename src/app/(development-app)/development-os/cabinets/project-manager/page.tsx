import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  GitBranch,
  Sparkles,
} from "lucide-react";
import {
  DashboardKpi,
  DonutRatioCard,
  NoItemsYet,
} from "@/components/ui/primitives";
import {
  HalfDonutGauge,
  HatchedBarChart,
  HeroGreetingAI,
  KpiRowMixed,
  TeamRowList,
  type HatchedBarDatum,
  type KpiItem,
  type TeamRowItem,
} from "@/components/award";
import { ProjectPipelineKanban } from "./_project-pipeline-kanban";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadProjectManagerCabinet } from "@/lib/development/server/cabinets/project-manager-cabinet-queries";
import {
  loadActiveSubcontractors,
  loadProjectCompletion,
} from "@/lib/development/server/pm/pm-subcontractor-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { formatMinorAsCurrency } from "@/lib/development/server/executive/widgets-helpers";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Mega-Sprint / Phase 6 — Project Manager cabinet on Sprint-4 gold
 * standard. Replaces the Stage-10.5.A.1.3 CabinetGreetingBlock +
 * PageHeaderHero stack with <HeroGreetingAI>, swaps the headline KPI
 * grid for <KpiRowMixed> with an emerald-solid hero (Active
 * projects), adds a Today's-pulse hatched-bar of daily QA/QC + CO
 * cadence + a portfolio-health half-donut, surfaces an inline 3-card
 * grid of recent PM-relevant agent outputs, and wraps the existing
 * project list in <KanbanBoard> as the portfolio-pipeline view. The
 * "Critical path" side panel is preserved.
 */

export const metadata: Metadata = { title: "Project manager · Cabinet" };
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

const AGENT_HREF: Record<string, string> = {
  daily_construction_digest:
    "/development-os/ai-agents/daily-construction-digest/outputs",
  daily_digest: "/development-os/ai-agents/daily-digest/outputs",
  weekly_construction_plan:
    "/development-os/ai-agents/weekly-construction-plan/outputs",
  weekly_plan: "/development-os/ai-agents/weekly-plan/outputs",
  executive_business: "/development-os/ai-agents/executive-business/outputs",
};

const AGENT_LABEL: Record<string, string> = {
  daily_construction_digest: "Daily digest",
  daily_digest: "Daily digest",
  weekly_construction_plan: "Weekly plan",
  weekly_plan: "Weekly plan",
  executive_business: "Executive",
};

export default async function ProjectManagerCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("project-manager");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const data = await safeQuery("pmCabinet", loadProjectManagerCabinet(), {
    projects: [],
    projectsAtRisk: [],
    totals: {
      activeProjectsCount: 0,
      openQaQcCount: 0,
      openRisksCount: 0,
      pendingChangeOrdersCount: 0,
    },
    latestDailyDigestCode: null,
    latestWeeklyPlanCode: null,
    recentMemoryItemsCount: 0,
    activityLast7Days: [],
    recentPmAgentOutputs: [],
  });

  const t = data.totals;
  const now = new Date();
  const dailyActivity = bucketLast7Days(data.activityLast7Days, now);

  // Sprint MD-4 Phase 1 — subcontractor + completion aggregators.
  const projectIds = data.projects.map((p) => p.id);
  const [subcontractors, completionRows] = await Promise.all([
    safeQuery(
      "pmSubcontractors",
      loadActiveSubcontractors(projectIds, 8),
      [] as Awaited<ReturnType<typeof loadActiveSubcontractors>>,
    ),
    safeQuery(
      "pmCompletion",
      loadProjectCompletion(projectIds),
      [] as Awaited<ReturnType<typeof loadProjectCompletion>>,
    ),
  ]);
  const completionNumerator = completionRows.reduce(
    (acc, r) => acc + r.actualPercent,
    0,
  );
  const completionDenominator =
    completionRows.length === 0 ? 100 : completionRows.length * 100;
  const subcontractorTeamItems: TeamRowItem[] = subcontractors.map((s) => ({
    name: s.name,
    workingOn: s.projectName
      ? `${s.workingOn} · ${s.projectName}`
      : s.workingOn,
    status:
      s.status === "active"
        ? "in_progress"
        : s.status === "blocked"
          ? "blocked"
          : "pending",
    statusLabel: s.statusLabel,
    href: s.href,
  }));

  const kpis: KpiItem[] = [
    {
      label: "Active projects",
      value: String(t.activeProjectsCount),
      delta:
        t.activeProjectsCount === 0
          ? "No active portfolio"
          : `${data.projectsAtRisk.length} on watch`,
      href: "/development-os/projects",
    },
    {
      label: "Open QA / QC",
      value: String(t.openQaQcCount),
      delta:
        t.openQaQcCount === 0
          ? "Queue clear"
          : "Need triage",
      href: "/development-os/qa-qc",
    },
    {
      label: "Open risks",
      value: String(t.openRisksCount),
      delta:
        t.openRisksCount === 0
          ? "Register clean"
          : "Need mitigation",
      href: "/development-os/risk-register",
    },
    {
      label: "Pending change orders",
      value: String(t.pendingChangeOrdersCount),
      delta:
        t.pendingChangeOrdersCount === 0
          ? "No variations"
          : "Awaiting decision",
      href: "/development-os/change-orders",
    },
  ];

  const portfolioRisky = data.projectsAtRisk.length;
  const portfolioHealthy = Math.max(
    0,
    t.activeProjectsCount - portfolioRisky,
  );
  const healthPct =
    t.activeProjectsCount > 0
      ? Math.round((portfolioHealthy / t.activeProjectsCount) * 100)
      : 0;

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8 md:gap-10">
        <HeroGreetingAI
          firstName={firstName}
          role="Project Manager · Cabinet"
          dateLabel={todayLabel(now)}
          aiPromptPlaceholder="Brief me on today — daily-construction-digest."
          showMyTasksHref="/development-os/projects"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            {
              href: "/development-os/qa-qc",
              icon: AlertTriangle,
              label: "Triage QA / QC",
              caption:
                t.openQaQcCount > 0
                  ? `${t.openQaQcCount} open`
                  : "Queue clear",
            },
            {
              href: "/development-os/change-orders",
              icon: GitBranch,
              label: "Decide change orders",
              caption:
                t.pendingChangeOrdersCount > 0
                  ? `${t.pendingChangeOrdersCount} pending`
                  : "No variations",
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

        <KpiRowMixed kpis={kpis} heroTone="emerald-solid" />

        <Section
          eyebrow="Today's pulse"
          title="QA/QC + change-order cadence"
          description="Daily QA/QC issue creations + change-order requests across the portfolio for the last 7 days, alongside the share of projects in good standing."
        >
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-5">
            <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                  Last 7 days
                </span>
                <span className="text-xs text-ink-tertiary tabular-nums">
                  {data.activityLast7Days.reduce(
                    (s, r) => s + r.count,
                    0,
                  )}{" "}
                  events
                </span>
              </div>
              <HatchedBarChart
                data={dailyActivity}
                tone="emerald"
                height={200}
              />
            </div>
            <HalfDonutGauge
              variant="emerald"
              value={healthPct}
              max={100}
              label={
                <>
                  <p className="text-display text-[28px] md:text-[36px] leading-none font-medium text-ink tabular-nums">
                    {healthPct}%
                  </p>
                  <p className="text-xs text-ink-tertiary mt-1">
                    Projects in good standing
                  </p>
                </>
              }
              legend={[
                { label: `${portfolioHealthy} healthy` },
                {
                  label: `${portfolioRisky} at risk`,
                  color: "var(--line-strong)",
                },
              ]}
            />
          </div>
        </Section>

        <Section
          eyebrow="AI"
          title="Daily digest + weekly plan + executive brief"
          description="Latest outputs from the agents PMs check daily. Each card opens the agent's review screen."
        >
          {data.recentPmAgentOutputs.length === 0 ? (
            <div className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                Recent runs
              </span>
              <p className="text-sm leading-relaxed opacity-90">
                No outputs yet. Trigger the daily-construction-digest,
                weekly-construction-plan, or executive-business agents
                from Jobs to see them surface here.
              </p>
              <Badge tone="outline" className="self-start">
                Run an agent to populate
              </Badge>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              {data.recentPmAgentOutputs.map((o) => {
                const base =
                  AGENT_HREF[o.agentKey] ??
                  "/development-os/ai-agents";
                return (
                  <Link
                    key={o.outputCode}
                    href={`${base}/${o.outputCode}`}
                    className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3 hover:bg-muted/40 transition-colors min-h-[180px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
                        {AGENT_LABEL[o.agentKey] ?? o.agentKey} · {o.outputCode}
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
                );
              })}
            </div>
          )}
        </Section>

        <Section
          eyebrow="Team"
          title="Active subcontractors + completion"
          description="Subcontractors currently delivering on a work package alongside the portfolio's actual-completion roll-up."
        >
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-5">
            <TeamRowList
              items={subcontractorTeamItems}
              heading="Subcontractors on site"
              emptyMessage="No active subcontractor assignments. Assign a primary vendor to a work package to surface them here."
            />
            <DonutRatioCard
              title="Portfolio completion"
              numerator={completionNumerator}
              denominator={completionDenominator}
              tone="emerald"
              caption={
                completionRows.length === 0
                  ? "No work packages tracked yet"
                  : `Across ${completionRows.length} project${completionRows.length === 1 ? "" : "s"}`
              }
            />
          </div>
        </Section>

        <Section
          eyebrow="Portfolio"
          title="Project pipeline"
          description="Active projects bucketed by lifecycle status. Click a card to open the project."
          action={
            <Link
              href="/development-os/projects"
              className="text-xs text-ink-tertiary hover:underline"
            >
              All projects →
            </Link>
          }
        >
          {data.projects.length === 0 ? (
            <NoItemsYet
              entityLabel="projects"
              description="Create a project from /development-os/projects to start tracking."
            />
          ) : (
            <ProjectPipelineKanban projects={data.projects} />
          )}
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Section
              eyebrow="Memory"
              title="Knowledge captured"
              description="Project AI memory items observed in the last 14 days."
            >
              <DashboardKpi
                label="Memory items (14d)"
                value={String(data.recentMemoryItemsCount)}
                status="neutral"
                drillHref="/development-os/projects"
                hint="Active project_ai_memory rows"
              />
            </Section>
          </div>

          <aside>
            <Section
              eyebrow="Critical path"
              title="Projects at risk"
              description="Top 5 by open QA/QC + risks + change orders."
            >
              {data.projectsAtRisk.length === 0 ? (
                <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                  No risky projects right now. Open QA/QC, risks, and
                  change orders surface here as they pile up.
                </div>
              ) : (
                <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                  {data.projectsAtRisk.map((p) => (
                    <li key={p.id} className="px-4 py-3">
                      <Link
                        href={`/development-os/projects/${p.id}`}
                        className="block group"
                      >
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <span className="font-medium text-sm truncate group-hover:underline">
                            {p.name}
                          </span>
                          <Badge
                            tone={
                              p.riskScore >= 10
                                ? "danger"
                                : p.riskScore >= 4
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            score {p.riskScore}
                          </Badge>
                        </div>
                        <div className="text-xs text-ink-tertiary">
                          {p.openQaQcCount} QA/QC · {p.openRisksCount} risks ·{" "}
                          {p.pendingChangeOrdersCount} COs
                          {p.budgetUsdMinor !== null && (
                            <>
                              {" · "}
                              {formatMinorAsCurrency(p.budgetUsdMinor, "USD")}{" "}
                              budgeted
                            </>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </aside>
        </div>
      </div>
    </DevelopmentShell>
  );
}
