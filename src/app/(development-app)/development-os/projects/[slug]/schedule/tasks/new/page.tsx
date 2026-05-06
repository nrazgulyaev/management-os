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
        <PageHeader title="New task" />
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
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: project.name, href: `/development-os/projects/${slug}` },
            { label: "Schedule", href: `/development-os/projects/${slug}/schedule` },
            { label: "New task" },
          ]}
          title="No work packages yet"
        />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Schedule", href: `/development-os/projects/${slug}/schedule` },
          { label: "Tasks", href: `/development-os/projects/${slug}/schedule/tasks` },
          { label: "New" },
        ]}
        title="New task"
        description="Optional dependency picker creates a single FS/SS/FF/SF edge with lag days. Cycle detection runs server-side — refuses cyclic graphs."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/schedule/tasks`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Tasks
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Task details">
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
      </Section>
    </DevelopmentShell>
  );
}
