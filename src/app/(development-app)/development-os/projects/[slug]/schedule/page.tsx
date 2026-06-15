import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import {
  listProjectTasks,
  listTaskDependenciesForTasks,
} from "@/lib/development/server/schedule/schedule-queries";
import { GanttChart } from "@/components/development/schedule/gantt-chart";

export const metadata: Metadata = { title: "Schedule · Development OS" };
export const dynamic = "force-dynamic";

export default async function ProjectSchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Schedule</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;

  const tasks = await listProjectTasks({ projectId: project.realProjectId });
  const taskIds = tasks.map((t) => t.id);
  const deps = await listTaskDependenciesForTasks(taskIds);

  const ganttTasks = tasks.map((t) => ({
    id: t.id,
    taskCode: t.taskCode,
    name: t.name,
    plannedStart: t.plannedStart,
    plannedFinish: t.plannedFinish,
    isOnCriticalPath: t.isOnCriticalPath,
    status: t.status,
  }));

  const cpCount = tasks.filter((t) => t.isOnCriticalPath).length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <span>Schedule</span>
          </div>
          <h1>Schedule (Gantt)</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Critical path is recomputed nightly by
            dev_os_critical_path_recompute. Manual recompute via the schedule
            actions.
          </p>
        </div>
        <div className="actions">
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}/schedule/lookahead`}>
                Lookahead
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}/schedule/tasks`}>
                Task list
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}`}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Project
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Gantt</div>
        <GanttChart tasks={ganttTasks} dependencies={deps} />
      </div>
    </DevelopmentShell>
  );
}
