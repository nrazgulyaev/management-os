import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadProjectManagerCabinet } from "@/lib/development/server/cabinets/project-manager-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Project manager · Cabinet" };
export const dynamic = "force-dynamic";

export default async function ProjectManagerCabinetPage() {
  const data = await safeQuery(
    "pmCabinet",
    loadProjectManagerCabinet(),
    {
      projects: [],
      totals: {
        activeProjectsCount: 0,
        openQaQcCount: 0,
        openRisksCount: 0,
        pendingChangeOrdersCount: 0,
      },
      latestDailyDigestCode: null,
      latestWeeklyPlanCode: null,
      recentMemoryItemsCount: 0,
    },
  );
  return (
    <DevelopmentShell>
      <PageHeader
        title="Project manager"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Cabinets" },
          { label: "Project manager" },
        ]}
        description="Multi-project oversight for PMs."
      />
      <Section title="Portfolio">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Active projects" value={String(data.totals.activeProjectsCount)} />
          <MetricCard label="Open QA/QC" value={String(data.totals.openQaQcCount)} />
          <MetricCard label="Open risks" value={String(data.totals.openRisksCount)} />
          <MetricCard label="Pending change orders" value={String(data.totals.pendingChangeOrdersCount)} />
        </div>
      </Section>
      <Section title="Active projects">
        {data.projects.length === 0 ? (
          <EmptyState title="No active projects" description="Create a project to start tracking." />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.projects.map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-line-soft bg-surface p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{p.name}</span>
                  <Badge tone="neutral">{p.status}</Badge>
                </div>
                <Link
                  href={`/development-os/projects/${p.id}`}
                  className="text-xs text-info hover:underline"
                >
                  Open project →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="AI insights for PMs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-md border border-line-soft bg-surface p-4">
            <div className="text-label">Latest daily digest</div>
            {data.latestDailyDigestCode ? (
              <Link
                href={`/development-os/ai-agents/daily-digest/outputs/${data.latestDailyDigestCode}`}
                className="text-sm text-info hover:underline"
              >
                {data.latestDailyDigestCode} →
              </Link>
            ) : (
              <span className="text-sm text-ink-tertiary">No digest yet</span>
            )}
          </div>
          <div className="rounded-md border border-line-soft bg-surface p-4">
            <div className="text-label">Latest weekly plan</div>
            {data.latestWeeklyPlanCode ? (
              <Link
                href={`/development-os/ai-agents/weekly-plan/outputs/${data.latestWeeklyPlanCode}`}
                className="text-sm text-info hover:underline"
              >
                {data.latestWeeklyPlanCode} →
              </Link>
            ) : (
              <span className="text-sm text-ink-tertiary">No plan yet</span>
            )}
          </div>
          <div className="rounded-md border border-line-soft bg-surface p-4">
            <div className="text-label">Memory items (last 14d)</div>
            <div className="text-2xl font-mono tabular-nums">
              {data.recentMemoryItemsCount}
            </div>
          </div>
        </div>
      </Section>
    </DevelopmentShell>
  );
}
