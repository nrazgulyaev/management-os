import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listWorkPackages } from "@/lib/development/server/work-packages/work-package-queries";
import { listProjectTasks } from "@/lib/development/server/schedule/schedule-queries";
import { TaskForm } from "@/components/development/schedule/task-form";

export const metadata: Metadata = { title: "New task · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewTaskPage({
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
            <h1>New task</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;

  const [packages, tasks] = await Promise.all([
    listWorkPackages({ projectId: project.realProjectId }),
    listProjectTasks({ projectId: project.realProjectId }),
  ]);

  if (packages.length === 0) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
              <Link href={`/development-os/projects/${slug}/schedule`}>Schedule</Link> /{" "}
              <span>New task</span>
            </div>
            <h1>No work packages yet</h1>
          </div>
        </div>
        <EmptyState
          title="Create a work package first"
          description="Tasks belong to work packages. Add the first one to begin scheduling."
          action={
            <Button asChild>
              <Link
                href={`/development-os/projects/${slug}/work-packages/new`}
              >
                + Work package
              </Link>
            </Button>
          }
        />
      </DevelopmentShell>
    );
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/schedule`}>Schedule</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/schedule/tasks`}>Tasks</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New task</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Optional dependency picker creates a single FS/SS/FF/SF edge with lag
            days. Cycle detection runs server-side — refuses cyclic graphs.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/schedule/tasks`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Tasks
            </Link>
          </Button>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <TaskForm
            workPackages={packages.map((p) => ({
              id: p.id,
              packageCode: p.packageCode,
              name: p.name,
            }))}
            existingTasks={tasks.map((t) => ({
              id: t.id,
              taskCode: t.taskCode,
              name: t.name,
            }))}
            projectSlug={slug}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
