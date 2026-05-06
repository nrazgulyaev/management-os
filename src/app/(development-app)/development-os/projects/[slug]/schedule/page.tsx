import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
        <PageHeader title="Schedule" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Schedule" },
        ]}
        eyebrow={`${tasks.length} task${tasks.length === 1 ? "" : "s"} · ${cpCount} on critical path · ${inProgressCount} in progress`}
        title="Schedule (Gantt)"
        description="Critical path is recomputed nightly by dev_os_critical_path_recompute. Manual recompute via the schedule actions."
        actions={
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
        }
      />

      <Section eyebrow="Gantt" title="Tasks + dependencies + critical path">
        <GanttChart tasks={ganttTasks} dependencies={deps} />
      </Section>
    </DevelopmentShell>
  );
}
