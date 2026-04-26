import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FieldQuickActions } from "@/components/field/field-quick-actions";
import { TaskStatusPill } from "@/components/operations/task-status-pill";
import { PriorityPill } from "@/components/operations/priority-pill";
import { ChevronRight, CheckCircle2, Clock, Wrench } from "lucide-react";
import { listTasksForCurrentStaff, type OperationTaskRow } from "@/features/operations/services";
import { isDbConfigured } from "@/lib/env";
import type { WithSource } from "@/features/types";

export const metadata = { title: "Today — Field" };
export const dynamic = "force-dynamic";

const demoTasks: WithSource<OperationTaskRow>[] = [
  {
    source: "mock",
    id: "demo-eternal-07",
    taskCode: "OPS-DEMO-0001",
    title: "Turnover · Eternal 07",
    description: null,
    category: "housekeeping",
    priority: "normal",
    status: "needs_review",
    taskSource: "manual",
    villaId: null,
    villaCode: "EV-07",
    projectId: null,
    projectName: null,
    assignedTo: null,
    assignedToName: "You",
    scheduledFor: new Date().toISOString().slice(0, 10),
    dueAt: null,
    startedAt: null,
    completedAt: null,
    approvedAt: null,
    estimatedMinutes: 90,
    actualMinutes: null,
    internalNotes: null,
    ownerVisible: false,
    guestVisible: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export default async function FieldHome() {
  const live = isDbConfigured();
  const liveTasks = live ? await listTasksForCurrentStaff() : [];
  const tasks = liveTasks.length > 0 ? liveTasks : demoTasks;

  const counts = {
    assigned: tasks.length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    doneToday: tasks.filter(
      (t) => (t.status === "completed" || t.status === "approved") && t.completedAt,
    ).length,
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="text-label">{today}</span>
        <h1 className="text-display text-[28px] leading-tight font-medium text-ink mt-2">
          Today's tasks
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {liveTasks.length > 0
            ? `${counts.assigned} task${counts.assigned === 1 ? "" : "s"} assigned to you.`
            : "Live tasks appear once you sign in and a supervisor assigns work."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Assigned", v: String(counts.assigned), icon: Clock },
          { l: "In progress", v: String(counts.inProgress), icon: Wrench },
          { l: "Done today", v: String(counts.doneToday), icon: CheckCircle2 },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.l}
              className="rounded-md border border-line-soft bg-surface p-3 flex flex-col items-start gap-2"
            >
              <Icon className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
              <div className="font-mono tabular-nums text-lg text-ink">{k.v}</div>
              <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                {k.l}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {tasks.map((t) => {
          const href =
            t.source === "db" ? `/field/tasks/${t.id}` : "/field/tasks/demo";
          return (
            <Link
              key={t.id}
              href={href}
              className="rounded-lg border border-line-soft bg-surface p-4 flex items-start justify-between gap-3 hover:border-line-strong transition-colors active:translate-y-[1px]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-ink-tertiary">
                    {t.taskCode}
                  </span>
                  <PriorityPill priority={t.priority} />
                  {t.scheduledFor && (
                    <span className="text-[11px] text-ink-tertiary tabular-nums">
                      {t.scheduledFor}
                    </span>
                  )}
                  {t.source === "mock" && <Badge tone="outline">demo</Badge>}
                </div>
                <div className="text-ink font-medium text-sm mt-2">{t.title}</div>
                <div className="text-xs text-ink-secondary mt-0.5 capitalize">
                  {t.category.replace(/_/g, " ")}
                  {t.villaCode ? ` · ${t.villaCode}` : ""}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <TaskStatusPill status={t.status} />
                <ChevronRight className="w-4 h-4 text-ink-tertiary" />
              </div>
            </Link>
          );
        })}
      </div>

      <div>
        <span className="text-label mb-3 inline-block">Quick actions</span>
        <FieldQuickActions />
      </div>

      <div className="mt-2 p-4 rounded-md border border-dashed border-line-soft bg-muted/30">
        <span className="text-label">Live + demo</span>
        <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
          Live tasks come from the operations runtime when you're signed in and assigned
          work. The demo task at <Link href="/field/tasks/demo" className="underline">/field/tasks/demo</Link>{" "}
          stays available to walk-through the field UX without a database.
        </p>
      </div>
    </div>
  );
}
