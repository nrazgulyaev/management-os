import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Building2, Compass } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { ProductAccessChangedBanner } from "@/components/layout/product-access-changed-banner";
import { DevelopmentMetricCard } from "@/components/development/metric-card";
import { ModuleCard } from "@/components/development/module-card";
import { ProjectHealthCard } from "@/components/development/project-health-card";
import { AIInsightPanel } from "@/components/development/ai-insight-panel";
import { SnapshotPanel } from "@/components/development/snapshot-panel";
import {
  mockAIAgents,
  mockExecutiveInsight,
  mockProjectHealth,
  mockSnapshotPanels,
  mockTopMetrics,
} from "@/lib/development/mock-data";
import { getModulesByStatus } from "@/lib/development/navigation";
import { getDevelopmentProjects } from "@/lib/development/server/projects";

export const metadata: Metadata = {
  title: "Command center · Development OS",
  description:
    "Internal command center for Arconique Development OS — live KPIs, project health, AI executive insight, and module navigation.",
};
export const dynamic = "force-dynamic";

export default async function DevelopmentCommandCenterPage({
  searchParams,
}: {
  // Sprint 3c — `?from=<product>&reason=<…>` is set when
  // enforceProductAccess() redirects a user here after losing access
  // to another product (typically Mgmt-only customers landing here
  // after a Bundle→Dev-only switch in the rare reverse direction).
  searchParams?: Promise<{ from?: string; reason?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const nextModules = getModulesByStatus("next");
  const roadmapModules = getModulesByStatus("roadmap");
  const projects = await getDevelopmentProjects();

  return (
    <DevelopmentShell>
      <ProductAccessChangedBanner from={sp.from} reason={sp.reason} />
      <PageHeader
        eyebrow="Thursday · 30 April 2026"
        title="Development command center."
        description="Three active projects, 29 units in flight, $1.82M deployed across the build cycle. One AI insight needs your read this morning."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href="/development">
                <Compass className="w-4 h-4" strokeWidth={1.75} />
                Public preview
              </Link>
            </Button>
            <Button asChild>
              <Link href="/development-os/projects">
                <Building2 className="w-4 h-4" strokeWidth={1.75} />
                Projects
              </Link>
            </Button>
          </div>
        }
      />

      <Section
        eyebrow="Top of mind"
        title="Portfolio KPIs"
        description="Across all active developments. Cards in amber need your read this week."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {mockTopMetrics.map((m) => (
            <DevelopmentMetricCard key={m.id} metric={m} />
          ))}
        </div>
      </Section>

      <AIInsightPanel insight={mockExecutiveInsight} />

      <Section
        eyebrow="Projects"
        title="Project health · 3 active"
        description="Each card is a one-glance read on schedule, budget, sales, and AI risk."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/development-os/projects">
              All projects
              <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Link>
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const health = mockProjectHealth.find(
              (h) => h.projectId === `dev-${project.slug}` || h.projectId === project.id,
            );
            return (
              <ProjectHealthCard
                key={project.id}
                project={project}
                health={health}
              />
            );
          })}
        </div>
      </Section>

      <Section
        eyebrow="Modules"
        title="Build first wave"
        description="What we are committing to ship in the upcoming stages. Roadmap items below are intentionally placeholders — we ship them when they're scoped, not when they're listed."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {nextModules.map((m) => (
            <ModuleCard key={m.id} module={m} />
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4">
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-label">Roadmap · not yet built</span>
              <p className="text-sm text-ink-secondary">
                Scoped, prioritized, but not in this wave.
              </p>
            </div>
            <Badge tone="neutral">{roadmapModules.length} planned</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {roadmapModules.map((m) => (
              <ModuleCard key={m.id} module={m} />
            ))}
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Snapshots"
        title="Operating picture"
        description="Plan vs. forecast across cash, budget, progress, and the sales funnel. A real chart library will replace the placeholders in stage 2."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {mockSnapshotPanels.map((panel) => (
            <SnapshotPanel key={panel.id} data={panel} />
          ))}
        </div>
      </Section>

      <Section
        eyebrow="AI surface"
        title="Two agents shipping first"
        description="The full agent roster is on the public page. Inside the OS, you only see what's wired up."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mockAIAgents
            .filter((a) => a.status === "live")
            .map((agent) => (
              <div
                key={agent.id}
                className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">
                    {agent.name}
                  </span>
                  <Badge tone="accent">Live</Badge>
                </div>
                <p className="text-sm text-ink-secondary leading-relaxed">
                  {agent.description}
                </p>
              </div>
            ))}
        </div>
      </Section>
    </DevelopmentShell>
  );
}
