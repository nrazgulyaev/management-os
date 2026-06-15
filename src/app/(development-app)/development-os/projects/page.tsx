import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kpi } from "@/components/dashboard/primitives";
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

function fmtMillions(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${Math.round(usd)}`;
}

const HEALTH_LABEL: Record<HealthLevel, string> = {
  green: "Green",
  amber: "Amber",
  red: "Red",
};

export default async function ProjectsPage() {
  const projects = await getDevelopmentProjects();

  const counts = {
    total: projects.length,
    active: projects.filter(
      (p) => p.phase === "under_construction" || p.phase === "fit_out",
    ).length,
    design: projects.filter(
      (p) => p.phase === "design" || p.phase === "permitting",
    ).length,
    closing: projects.filter(
      (p) => p.phase === "managed" || p.phase === "archived",
    ).length,
  };

  // KPI strip — capex committed (budget used) of total budget, and the
  // schedule-health distribution across the portfolio.
  const committedUsd = projects.reduce(
    (a, p) => a + Number(p.budgetUsedMinor) / 100,
    0,
  );
  const totalBudgetUsd = projects.reduce(
    (a, p) => a + Number(p.totalBudgetMinor) / 100,
    0,
  );
  const healthByLevel = projects.reduce(
    (acc, p) => {
      acc[projectHealth(p).health] += 1;
      return acc;
    },
    { green: 0, amber: 0, red: 0 } as Record<HealthLevel, number>,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Projects</span>
          </div>
          <h1>Projects</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Every project Arconique is currently developing. Click a card to
            open the project detail with milestones, BOQ, procurement, and team.
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/development-os/projects?export=csv">Export</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/investors">↗ Investor view</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="projects-kpi-strip">
        <Kpi
          label="Active projects"
          value={counts.total}
          sub={`${counts.active} building · ${counts.design} design · ${counts.closing} closing`}
          tone="accent"
        />
        <Kpi
          label="Capex committed"
          value={fmtMillions(committedUsd)}
          sub={`of ${fmtMillions(totalBudgetUsd)} total budget`}
        />
        <Kpi
          label="On track"
          value={healthByLevel.green}
          sub={`${healthByLevel.amber} amber · ${healthByLevel.red} red`}
        />
        <Kpi
          label="Schedule health"
          value={`${healthByLevel.green} ★`}
          sub={`${healthByLevel.amber} amber · ${healthByLevel.red} red`}
          tone={healthByLevel.red > 0 ? "warn" : undefined}
        />
      </div>

      <div className="projects-grid">
        {projects.map((p) => {
          const budgetUsd = Number(p.budgetUsedMinor) / 100;
          const totalUsd = Number(p.totalBudgetMinor) / 100;
          const budgetPct = totalUsd > 0 ? (budgetUsd / totalUsd) * 100 : 0;
          const { health, reason } = projectHealth(p);
          const handover = p.expectedHandover
            ? new Date(p.expectedHandover).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })
            : "TBD";
          return (
            <ProjectCard
              key={p.id}
              id={p.id}
              href={`/development-os/projects/${p.slug}`}
              code={p.slug.toUpperCase().slice(0, 8)}
              name={p.name}
              phaseLabel={`${p.location} · ${p.units} villas · ${(PHASE_LABEL[p.phase] ?? p.phase).toUpperCase()}`}
              schedulePct={p.constructionProgressPct}
              scheduleLabel={`est. ${handover}`}
              health={health}
              healthReason={`${HEALTH_LABEL[health]} · ${reason}`}
              stats={[
                {
                  label: "Budget",
                  value: `${fmtMillions(budgetUsd)} / ${fmtMillions(totalUsd)}`,
                },
                {
                  label: "Budget burn",
                  value: `${Math.round(budgetPct)}%`,
                  tone: budgetPct > 100 ? "danger" : budgetPct > 90 ? "warn" : "ok",
                },
              ]}
            />
          );
        })}
      </div>
    </DevelopmentShell>
  );
}
