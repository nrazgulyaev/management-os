import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getProjectTaskByCode,
  listTaskDependenciesForTasks,
} from "@/lib/development/server/schedule/schedule-queries";

export const metadata: Metadata = { title: "Task · Development OS" };
export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Task" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const task = await getProjectTaskByCode(decodeURIComponent(code));
  if (!task) notFound();
  const deps = await listTaskDependenciesForTasks([task.id]);
  const predecessors = deps.filter((d) => d.successorId === task.id);
  const successors = deps.filter((d) => d.predecessorId === task.id);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Schedule", href: `/development-os/projects/${slug}/schedule` },
          {
            label: "Tasks",
            href: `/development-os/projects/${slug}/schedule/tasks`,
          },
          { label: task.taskCode },
        ]}
        eyebrow={`${task.status} · ${task.durationDays ?? "?"} days`}
        title={task.name}
        description={task.description ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/schedule/tasks`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Tasks
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Status" title="Lifecycle + critical path">
        <div className="flex items-center gap-2 mb-3">
          <Badge tone={task.status === "completed" ? "success" : "info"}>
            {task.status}
          </Badge>
          {task.isOnCriticalPath && <Badge tone="danger">CRITICAL PATH</Badge>}
          <span className="text-xs text-ink-tertiary">
            {Number(task.progressPercentage).toFixed(0)}% complete
          </span>
        </div>
      </Section>

      <Section eyebrow="Schedule" title="Planned + early/late + float">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Planned start" value={task.plannedStart} />
          <Field label="Planned finish" value={task.plannedFinish} />
          <Field label="Duration (days)" value={String(task.durationDays ?? "—")} />
          <Field label="Early start" value={task.earlyStart ?? "—"} />
          <Field label="Early finish" value={task.earlyFinish ?? "—"} />
          <Field label="Late start" value={task.lateStart ?? "—"} />
          <Field label="Late finish" value={task.lateFinish ?? "—"} />
          <Field
            label="Total float (days)"
            value={
              task.totalFloatDays != null ? String(task.totalFloatDays) : "—"
            }
          />
          <Field
            label="CP last computed"
            value={
              task.cpLastComputedAt
                ? new Date(task.cpLastComputedAt).toLocaleString()
                : "Never"
            }
          />
        </div>
      </Section>

      <Section
        eyebrow="Dependencies"
        title={`${predecessors.length} predecessor(s) · ${successors.length} successor(s)`}
      >
        {predecessors.length + successors.length === 0 ? (
          <p className="text-sm text-ink-tertiary">
            No dependencies. This task starts and finishes independently.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
                Predecessors
              </div>
              <ul className="space-y-1">
                {predecessors.map((d) => (
                  <li
                    key={d.id}
                    className="text-xs font-mono border border-line-soft rounded px-2 py-1"
                  >
                    {d.predecessorId.slice(0, 8)} ({d.dependencyType}, lag{" "}
                    {d.lagDays}d)
                  </li>
                ))}
                {predecessors.length === 0 && (
                  <li className="text-xs text-ink-tertiary">—</li>
                )}
              </ul>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
                Successors
              </div>
              <ul className="space-y-1">
                {successors.map((d) => (
                  <li
                    key={d.id}
                    className="text-xs font-mono border border-line-soft rounded px-2 py-1"
                  >
                    {d.successorId.slice(0, 8)} ({d.dependencyType}, lag{" "}
                    {d.lagDays}d)
                  </li>
                ))}
                {successors.length === 0 && (
                  <li className="text-xs text-ink-tertiary">—</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </Section>
    </DevelopmentShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}
