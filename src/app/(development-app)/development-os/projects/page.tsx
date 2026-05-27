import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { ProjectCard } from "@/components/projects/project-card";
import type { HealthLevel } from "@/components/projects/health-pill";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { computeHealth } from "@/features/projects/health";

/**
 * Phase 2.2 dev-01 — Projects list refactored to the new card grid
 * primitive (template 04 list page is overkill here; the list is
 * 6–12 cards with rich progress + health, not a paginated table).
 *
 * Filter/sort + cabinet-wide bulk actions land alongside the data
 * PR in the next slice; today the grid renders every active
 * project sorted by name.
 */

export const metadata: Metadata = { title: "Projects · Development OS" };
export const dynamic = "force-dynamic";

const PHASE_LABEL: Record<string, string> = {
  pre_acquisition: "Pre-acquisition",
  acquisition: "Acquisition",
  design: "Design",
  permitting: "Permitting",
  under_construction: "Under construction",
  fit_out: "Fit-out",
  handover: "Handover",
  operating: "Operating",
  archived: "Archived",
};

function projectHealth(p: {
  budgetUsedMinor: bigint;
  totalBudgetMinor: bigint;
  expectedHandover: string | null;
}): { health: HealthLevel; reason: string } {
  const budgetUsed = Number(p.budgetUsedMinor) / 100;
  const budgetTotal = Number(p.totalBudgetMinor) / 100;
  // PR 2.2 dev-01 proof-of-life — milestone roster lands in the
  // data PR; for now we synthesize a single "expected handover"
  // milestone and compute slip against today.
  const today = new Date();
  const target = p.expectedHandover ? new Date(p.expectedHandover) : null;
  const slipDays =
    target && target < today
      ? Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
  const h = computeHealth({
    milestones: [{ slipDays, status: "in_progress" }],
    budgetTotal,
    budgetActual: budgetUsed,
  });
  return { health: h.overall, reason: h.reason };
}

export default async function ProjectsPage() {
  const projects = await getDevelopmentProjects();

  const counts = {
    total: projects.length,
    active: projects.filter(
      (p) => p.phase === "under_construction" || p.phase === "fit_out",
    ).length,
    planning: projects.filter(
      (p) =>
        p.phase === "permitting" ||
        p.phase === "design" ||
        p.phase === "pre_acquisition" ||
        p.phase === "acquisition",
    ).length,
  };

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[{ label: "Development OS", href: "/development-os" }, { label: "Projects" }]}
        eyebrow={`${counts.total} projects · ${counts.active} active · ${counts.planning} planning`}
        title="Projects"
        description="Every project Arconique is currently developing. Click a card to open the project detail with milestones, BOQ, procurement, and team."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      <div className="projects-grid">
        {projects.map((p) => {
          const budgetUsd = Number(p.budgetUsedMinor) / 100;
          const totalUsd = Number(p.totalBudgetMinor) / 100;
          const budgetPct = totalUsd > 0 ? (budgetUsd / totalUsd) * 100 : 0;
          const { health, reason } = projectHealth(p);
          return (
            <ProjectCard
              key={p.id}
              id={p.id}
              href={`/development-os/projects/${p.slug}`}
              code={p.slug.toUpperCase().slice(0, 8)}
              name={p.name}
              phaseLabel={`${PHASE_LABEL[p.phase] ?? p.phase} · ${p.location}`}
              schedulePct={p.constructionProgressPct}
              scheduleLabel={`${p.constructionProgressPct}% built`}
              budgetPct={budgetPct}
              budgetLabel={`$${(budgetUsd / 1_000_000).toFixed(2)}M of $${(totalUsd / 1_000_000).toFixed(2)}M`}
              health={health}
              healthReason={reason}
              stats={[
                { label: "Units", value: `${p.unitsSold}/${p.units}` },
                { label: "AI risk", value: p.aiRiskScore },
              ]}
            />
          );
        })}
      </div>
    </DevelopmentShell>
  );
}
