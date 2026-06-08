import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { safeQuery } from "@/lib/development/safe-query";
import { composeWeeklyReport } from "@/features/ai-agents/projects/weekly-report-data";
import { WeeklyReportCard } from "@/components/projects/weekly-report-card";
import { MilestonesEditor } from "./_editor-client";
import type { MilestoneRowMilestone } from "@/components/projects/milestone-row";

/**
 * Phase 2.2 dev-01 — Standalone milestones editor.
 *
 * Flat list, dependency indicator per row, status select. Real DB
 * persistence + drag-and-drop reordering land in 2.2 data-wiring.
 * Today the editor seeds itself from the existing project phases
 * roster so the surface has visible content.
 *
 * NOTE: directory is named `[slug]` to match the existing project
 * tree (`/projects/[slug]/land`, `/projects/[slug]/schedule`, …).
 * The cabinet doc calls the param `id`; the implementation here
 * treats the value as opaque — pass a slug today, a UUID tomorrow.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getDevelopmentProjectBySlug(slug);
  return { title: detail ? `${detail.project.name} · Milestones` : "Milestones" };
}

export default async function MilestonesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail) notFound();

  const today = new Date();
  // PR 2.2 dev-01 proof-of-life — synthesize from existing project
  // phases until the milestones schema lands. Each phase becomes a
  // milestone keyed by `phaseType`.
  const initial: MilestoneRowMilestone[] = detail.phases.map((p) => {
    const target = p.plannedEndDate ?? p.plannedStartDate ?? "—";
    let slipDays = 0;
    if (p.plannedEndDate && !p.actualEndDate) {
      const end = new Date(p.plannedEndDate);
      if (end < today) {
        slipDays = Math.floor((today.getTime() - end.getTime()) / 86_400_000);
      }
    }
    return {
      id: p.id,
      name: p.phaseType.replace(/_/g, " "),
      targetDate: target,
      actualDate: p.actualEndDate ?? undefined,
      status:
        p.actualEndDate
          ? "done"
          : slipDays > 21
            ? "blocked"
            : slipDays > 7
              ? "slipping"
              : p.actualStartDate
                ? "in_progress"
                : "planned",
      slipDays,
      dependencyCount: undefined,
    };
  });

  // W2 — weekly-report-composer surface. Deterministic assembly of the
  // past 7 days (milestones progressed, BOQ/cost movement, RFIs opened/
  // closed, site reports) for this project. `skipAiPolish` keeps page
  // renders cheap and free of per-load AI cost; the cron / a Run-now path
  // can request the LLM polish. `composeWeeklyReport` returns null when the
  // DB is unconfigured, so the card is omitted gracefully for mock data.
  const weeklyReport =
    detail.source === "db"
      ? await safeQuery(
          "composeWeeklyReport(project)",
          composeWeeklyReport({
            // organizationId is only consumed by the (skipped) AI polish
            // path; the deterministic reads are project-scoped.
            organizationId: detail.project.realProjectId,
            projectId: detail.project.realProjectId,
            skipAiPolish: true,
          }),
          null,
          4000,
        )
      : null;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Projects", href: "/development-os/projects" },
          { label: detail.project.name, href: `/development-os/projects/${slug}` },
          { label: "Milestones" },
        ]}
        eyebrow={`${initial.length} milestones · gantt-lite editor`}
        title="Milestones"
        description="Flat list with status + dependency indicator. Click a row to edit; drag-to-reorder lands in 2.2 data-wiring. Don't build a real Gantt for <30 milestones per project."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to project
            </Link>
          </Button>
        }
      />
      {weeklyReport && (
        <Section
          eyebrow="AI · weekly-report-composer"
          title="This week"
          description="Auto-assembled from the past 7 days of milestones, BOQ movement, RFIs, and site reports. The Friday cron drafts the investor-facing version with an LLM polish on top of this deterministic base."
        >
          <WeeklyReportCard
            weekStart={weeklyReport.weekStart}
            weekEnding={weeklyReport.weekEnding}
            markdown={weeklyReport.markdown}
            highlights={weeklyReport.highlights}
            aiPolished={weeklyReport.aiPolished}
            aiNote={weeklyReport.aiNote}
            isQuiet={weeklyReport.isQuiet}
          />
        </Section>
      )}
      <MilestonesEditor projectSlug={slug} initial={initial} />
    </DevelopmentShell>
  );
}
