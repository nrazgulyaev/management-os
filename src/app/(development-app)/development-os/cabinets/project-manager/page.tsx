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
import { loadProjectManagerCabinet } from "@/lib/development/server/cabinets/project-manager-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { formatMinorAsCurrency } from "@/lib/development/server/executive/widgets-helpers";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Stage 10.5.A.1.3 — Project Manager cabinet (replatformed).
 *
 * Layout vocabulary established by 10.5.A.1.1 (Owner) + 10.5.A.1.2
 * (CFO):
 *   - PageHeaderHero greeting + eyebrow
 *   - 4-column DashboardKpi row with status thresholds
 *   - 2/3-1/3 split body: portfolio + critical-path / activity column
 *
 * Critical-path mini-feed sorts by `riskScore` (open QA/QC + 2 ×
 * open risks + pending change orders). Top 5 surface with status
 * pills; click drills into the project detail.
 *
 * Trend deltas not available for PM totals yet — there is no
 * pm-snapshot table. Carry-over for 10.5.A.2.
 */

export const metadata: Metadata = { title: "Project manager · Cabinet" };
export const dynamic = "force-dynamic";

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
  });

  const t = data.totals;

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-10">
        <CabinetGreetingBlock
          firstName={firstName}
          eyebrow="Project manager · Cabinet"
          subline={
            t.activeProjectsCount === 0
              ? "No active projects yet — add one to start tracking risk."
              : `${t.activeProjectsCount} active project${t.activeProjectsCount === 1 ? "" : "s"} · ${data.projectsAtRisk.length} on watch`
          }
          badge={
            data.projectsAtRisk.length > 0 ? (
              <Badge tone="warning">{data.projectsAtRisk.length} at risk</Badge>
            ) : null
          }
        />

        <PageHeaderHero
          eyebrow="This week"
          title={
            t.activeProjectsCount === 0
              ? "No active projects yet"
              : `${t.activeProjectsCount} active project${t.activeProjectsCount === 1 ? "" : "s"}`
          }
          description="Portfolio risk, change orders, and what your AI agents flagged this week."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardKpi
            variant="hero"
            tone="emerald-soft"
            label="Active projects"
            value={String(t.activeProjectsCount)}
            status="neutral"
            drillHref="/development-os/projects"
            className="sm:col-span-2 lg:col-span-2"
          />
          <DashboardKpi
            label="Open QA / QC"
            value={String(t.openQaQcCount)}
            status={
              t.openQaQcCount === 0 ? "good" : t.openQaQcCount > 10 ? "bad" : "warn"
            }
            drillHref="/development-os/qa-qc"
          />
          <DashboardKpi
            label="Open risks"
            value={String(t.openRisksCount)}
            status={
              t.openRisksCount === 0 ? "good" : t.openRisksCount > 5 ? "bad" : "warn"
            }
            drillHref="/development-os/risk-register"
          />
          <DashboardKpi
            label="Pending change orders"
            value={String(t.pendingChangeOrdersCount)}
            status={t.pendingChangeOrdersCount === 0 ? "good" : "warn"}
            drillHref="/development-os/change-orders"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Section eyebrow="Portfolio" title="Active projects">
              {data.projects.length === 0 ? (
                <NoItemsYet
                  entityLabel="projects"
                  description="Create a project from /development-os/projects to start tracking."
                />
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.projects.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium truncate">{p.name}</span>
                        <Badge tone="neutral">{p.status}</Badge>
                      </div>
                      <Link
                        href={`/development-os/projects/${p.id}`}
                        className="text-xs text-info hover:underline mt-auto"
                      >
                        Open project →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section eyebrow="AI" title="Insights">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <AiInsightCard
                  label="Latest daily digest"
                  code={data.latestDailyDigestCode}
                  hrefBase="/development-os/ai-agents/daily-digest/outputs"
                />
                <AiInsightCard
                  label="Latest weekly plan"
                  code={data.latestWeeklyPlanCode}
                  hrefBase="/development-os/ai-agents/weekly-plan/outputs"
                />
                <div className="rounded-md border border-line-soft bg-surface p-4">
                  <div className="text-label">Memory items (14d)</div>
                  <div className="text-display text-[28px] leading-[32px] font-medium font-mono tabular-nums text-ink mt-1">
                    {data.recentMemoryItemsCount}
                  </div>
                </div>
              </div>
            </Section>
          </div>

          <aside className="flex flex-col gap-4">
            <Section eyebrow="Critical path" title="Projects at risk">
              {data.projectsAtRisk.length === 0 ? (
                <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                  No risky projects right now. Open QA/QC, risks, and change
                  orders surface here as they pile up.
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
              <div className="mt-2 flex justify-end">
                <Link
                  href="/development-os/projects"
                  className="text-xs text-ink-tertiary hover:underline"
                >
                  All projects →
                </Link>
              </div>
            </Section>
          </aside>
        </div>
      </div>
    </DevelopmentShell>
  );
}

function AiInsightCard({
  label,
  code,
  hrefBase,
}: {
  label: string;
  code: string | null;
  hrefBase: string;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <div className="text-label">{label}</div>
      {code ? (
        <Link
          href={`${hrefBase}/${code}`}
          className="text-sm text-info hover:underline"
        >
          {code} →
        </Link>
      ) : (
        <span className="text-sm text-ink-tertiary">No output yet</span>
      )}
    </div>
  );
}
