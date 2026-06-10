import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { ZoneProgressSlider } from "@/components/development/work-packages/zone-progress-slider";
import { ZoneActions } from "@/components/development/work-packages/zone-actions";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listWorkPackages } from "@/lib/development/server/work-packages/work-package-queries";
import { getProjectMilestones } from "@/lib/development/server/project-milestones";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Work zones · Development OS",
};
export const dynamic = "force-dynamic";

type BadgeTone = "ok" | "warn" | "danger" | "gold" | "info" | "ink" | "soft" | "amber";

const STATUS_BADGE: Record<string, { tone: BadgeTone; label: string }> = {
  planned: { tone: "soft", label: "planned" },
  ready_to_start: { tone: "info", label: "ready" },
  in_progress: { tone: "amber", label: "in progress" },
  completed: { tone: "ok", label: "done" },
  on_hold: { tone: "danger", label: "blocked" },
  cancelled: { tone: "soft", label: "cancelled" },
};

function fmtShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    .toUpperCase();
}

export default async function ProjectWorkPackagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Dev OS</Link>
              <span>/</span>
              <span>Work zones</span>
            </div>
            <h1>Work zones</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const [packages, milestones] = await Promise.all([
    safeQuery(
      "listWorkPackages",
      listWorkPackages({ projectId: project.realProjectId }),
      [],
      4000,
    ),
    safeQuery(
      "getProjectMilestones",
      getProjectMilestones(project.realProjectId),
      [],
      4000,
    ),
  ]);

  const counted = packages.filter((p) => p.status !== "cancelled");
  const activeCount = counted.filter((p) => p.status !== "completed").length;
  const doneCount = packages.filter(
    (p) => p.status === "completed" || Number(p.progressPercentage) >= 100,
  ).length;
  const avgProgress =
    counted.length > 0
      ? Math.round(
          counted.reduce((sum, p) => sum + Number(p.progressPercentage), 0) /
            counted.length,
        )
      : 0;
  // getProjectMilestones is sorted by target date ascending.
  const nextMilestone = milestones.find((m) => m.status !== "done") ?? null;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Dev OS</Link>
            <span>/</span>
            <Link href="/development-os/projects">Projects</Link>
            <span>/</span>
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link>
            <span>/</span>
            <span>Work zones</span>
          </div>
          <h1>Work zones</h1>
          <div className="page-header-meta">
            <span>
              {packages.length} PACKAGE{packages.length === 1 ? "" : "S"}
            </span>
            <span>·</span>
            <span>{activeCount} ACTIVE</span>
          </div>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}/work-packages/new`}
            className="btn btn-amber btn-sm"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            Cut work zone
          </Link>
          <Link
            href={`/development-os/projects/${slug}`}
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Project
          </Link>
        </div>
      </header>

      <p className="text-ink-3 text-sm max-w-3xl -mt-4 leading-relaxed">
        Cut the project into work zones (work packages), drag progress 0–100,
        and block/unblock with one click. Zone codes auto-increment per
        project; status and progress feed budget categories, purchase
        requests, invoices, and QA/QC via FK links.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi
          label="Active zones"
          value={
            <>
              {activeCount}
              <span className="text-[15px] text-[var(--ink-4)]">
                {" "}
                / {counted.length}
              </span>
            </>
          }
          sub="work packages in flight"
          tone="accent"
        />
        <Kpi label="Overall progress" value={`${avgProgress}%`} sub="avg across zones" />
        <Kpi
          label="Done"
          value={doneCount}
          sub="zones complete"
          tone={doneCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Next milestone"
          value={nextMilestone ? fmtShortDate(nextMilestone.targetDate) : "—"}
          sub={
            nextMilestone
              ? nextMilestone.name
              : milestones.length > 0
                ? "all milestones done"
                : "no milestones authored"
          }
        />
      </div>

      {packages.length === 0 ? (
        <EmptyState
          title="No work zones yet"
          description="Cut the project into work packages to track progress per zone."
          action={
            <Link
              href={`/development-os/projects/${slug}/work-packages/new`}
              className="btn btn-amber btn-sm"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              Cut work zone
            </Link>
          }
        />
      ) : (
        <Card padding="default">
          <div className="flex items-center justify-between gap-3 mb-3.5">
            <h3 className="cfo-card-title">Zone console</h3>
            <span className="label">{packages.length} zones · WP codes link to detail</span>
          </div>
          {packages.map((p) => {
            const progress = Math.round(Number(p.progressPercentage));
            const isDone = p.status === "completed" || progress >= 100;
            const isBlocked = p.status === "on_hold";
            const badge = isDone
              ? STATUS_BADGE.completed
              : (STATUS_BADGE[p.status] ?? STATUS_BADGE.planned);
            const rowClass = [
              "zone-row",
              (isDone || p.status === "cancelled") && "done",
              isBlocked && "blocked",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={p.id} className={rowClass}>
                <Link
                  href={`/development-os/projects/${slug}/work-packages/${p.packageCode}`}
                  className="zone-code"
                >
                  {p.packageCode}
                </Link>
                <div className="zone-main">
                  <div className="zone-name">
                    {p.name}
                    <HandoffBadge tone={badge.tone}>{badge.label}</HandoffBadge>
                  </div>
                  <div className="zone-meta">
                    {p.villaIds.length > 0
                      ? `${p.villaIds.length} villa${p.villaIds.length === 1 ? "" : "s"}`
                      : "project-wide"}
                    {" · "}
                    {p.plannedStart ?? "—"} → {p.plannedFinish ?? "—"}
                  </div>
                  <ZoneProgressSlider
                    workPackageId={p.id}
                    initialProgress={progress}
                    disabled={p.status === "completed" || p.status === "cancelled"}
                  />
                </div>
                <div className="zone-right">
                  <ZoneActions
                    workPackageId={p.id}
                    status={p.status}
                    progress={progress}
                  />
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </DevelopmentShell>
  );
}
