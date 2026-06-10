import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq, inArray } from "drizzle-orm";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { milestones as milestonesTable, milestoneDependencies } from "@/lib/db/schema/milestones";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { getProjectMilestones } from "@/lib/development/server/project-milestones";
import { safeQuery } from "@/lib/development/safe-query";
import { composeWeeklyReport } from "@/features/ai-agents/projects/weekly-report-data";
import { WeeklyReportCard } from "@/components/projects/weekly-report-card";
import {
  detectScheduleVariance,
  type ScheduleVarianceRuleFlag,
} from "@/features/ai-agents/projects/schedule-variance-rules";
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

/**
 * Read-only "Schedule variance" band data. Queries the real `milestones`
 * + `milestone_dependencies` tables (self-contained here to avoid a shared
 * module across feature units) and runs the deterministic detector from
 * `schedule-variance-rules`. Returns null on db-down (band is hidden).
 *
 * The flat editor below still synthesizes its rows from project phases
 * (PR 2.2 proof-of-life); this band is the first surface to read the real
 * milestone schema. Once the editor persists to `milestones`, the two
 * converge. TODO(2.2 data-wiring): drive the editor off this same query.
 */
async function loadScheduleVariance(
  realProjectId: string,
): Promise<{ flags: ScheduleVarianceRuleFlag[]; scanned: number } | null> {
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.projectId, realProjectId));
  if (rows.length === 0) return { flags: [], scanned: 0 };

  const ids = rows.map((m) => m.id);
  const edges = await db
    .select()
    .from(milestoneDependencies)
    .where(inArray(milestoneDependencies.toMilestoneId, ids));

  return detectScheduleVariance(
    rows.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      name: m.name,
      targetDate: m.targetDate,
      actualDate: m.actualDate,
      status: m.status,
    })),
    edges.map((e) => ({
      fromMilestoneId: e.fromMilestoneId,
      toMilestoneId: e.toMilestoneId,
      kind: e.kind,
    })),
    new Date(),
  );
}

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

  const variance = await loadScheduleVariance(detail.project.realProjectId);

  // 2.2 data-wiring — prefer the real authored `milestones` rows. When the
  // project has none yet, fall back to the phase-synthesized proof-of-life
  // roster below (the editor stays local-only in that mode).
  const persistedMilestones = await getProjectMilestones(detail.project.realProjectId);
  const hasPersisted = persistedMilestones.length > 0;

  const today = new Date();
  // PR 2.2 dev-01 proof-of-life — synthesize from existing project
  // phases when no milestones are authored yet. Each phase becomes a
  // milestone keyed by `phaseType`.
  const synthesized: MilestoneRowMilestone[] = detail.phases.map((p) => {
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

  const initial = hasPersisted ? persistedMilestones : synthesized;

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
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Dev OS</Link>
            <span>/</span>
            <Link href="/development-os/projects">Projects</Link>
            <span>/</span>
            <Link href={`/development-os/projects/${slug}`}>
              {detail.project.name}
            </Link>
            <span>/</span>
            <span>Milestones</span>
          </div>
          <h1>Milestones</h1>
          <div className="page-header-meta">
            <span>{initial.length} MILESTONES</span>
            <span>·</span>
            <span>GANTT-LITE EDITOR</span>
          </div>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}`}
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back to project
          </Link>
        </div>
      </header>

      <p className="text-ink-3 text-sm max-w-3xl -mt-4 leading-relaxed">
        {hasPersisted
          ? "Flat list with status + dependency indicator. Add, re-status, and delete milestones — changes persist to the milestones table and feed the schedule-variance detector below. Don't build a real Gantt for <30 milestones per project."
          : "No authored milestones yet — this preview is synthesized from project phases. Click “+ Add milestone” to author the first real milestone; once saved this list reads the milestones table. Don't build a real Gantt for <30 milestones per project."}
      </p>

      {weeklyReport && (
        <section>
          <div className="section-heading">
            <div className="label eyebrow">AI · weekly-report-composer</div>
            <h2>This week</h2>
            <p>
              Auto-assembled from the past 7 days of milestones, BOQ movement,
              RFIs, and site reports. The Friday cron drafts the investor-facing
              version with an LLM polish on top of this deterministic base.
            </p>
          </div>
          <WeeklyReportCard
            weekStart={weeklyReport.weekStart}
            weekEnding={weeklyReport.weekEnding}
            markdown={weeklyReport.markdown}
            highlights={weeklyReport.highlights}
            aiPolished={weeklyReport.aiPolished}
            aiNote={weeklyReport.aiNote}
            isQuiet={weeklyReport.isQuiet}
          />
        </section>
      )}

      {variance && variance.scanned > 0 && (
        <section>
          <div className="section-heading">
            <div className="label eyebrow">
              schedule-variance-detector · deterministic
            </div>
            <h2>Schedule variance</h2>
          </div>
          {variance.flags.length === 0 ? (
            <p className="text-sm text-ink-3">
              No milestones are slipping past their conservative thresholds
              ({variance.scanned} scanned). Amber flags slip of 7–20 days,
              red flags 21+ days, including slip propagated through
              finish-to-start dependencies.
            </p>
          ) : (
            <div className="card overflow-hidden">
              <table className="data">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Milestone</th>
                    <th>Cause</th>
                    <th className="num">Slip (days)</th>
                  </tr>
                </thead>
                <tbody>
                  {variance.flags.map((f) => (
                    <tr key={`${f.kind}:${f.milestoneId}`}>
                      <td>
                        <HandoffBadge
                          tone={f.severity === "red" ? "danger" : "warn"}
                        >
                          {f.severity}
                        </HandoffBadge>
                      </td>
                      <td className="font-medium text-ink">{f.milestoneName}</td>
                      <td className="text-xs text-ink-3">
                        {f.kind === "overdue_milestone"
                          ? "Target date passed, not done"
                          : `Dependency slip via ${String(f.detail.predecessorName ?? "predecessor")}`}
                      </td>
                      <td className="num">{f.slipDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <MilestonesEditor
        projectSlug={slug}
        projectId={detail.project.realProjectId}
        persistent={hasPersisted}
        initial={initial}
      />
    </DevelopmentShell>
  );
}
