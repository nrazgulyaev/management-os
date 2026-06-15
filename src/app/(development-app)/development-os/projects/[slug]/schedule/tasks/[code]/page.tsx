import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>Task</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/schedule`}>Schedule</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/schedule/tasks`}>Tasks</Link> /{" "}
            <span>{task.taskCode}</span>
          </div>
          <h1>{task.name}</h1>
          {task.description && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {task.description}
            </p>
          )}
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
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <div className="flex items-center gap-2">
            <HandoffBadge tone={task.status === "completed" ? "ok" : "info"}>
              {task.status}
            </HandoffBadge>
            {task.isOnCriticalPath && <HandoffBadge tone="danger">CRITICAL PATH</HandoffBadge>}
            <span className="text-xs text-ink-tertiary">
              {Number(task.progressPercentage).toFixed(0)}% complete
            </span>
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Schedule</div>
        <Card padding="default">
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Dependencies</div>
        <Card padding="default">
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
        </Card>
      </div>
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
