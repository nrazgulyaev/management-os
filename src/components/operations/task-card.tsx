import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TaskStatusPill } from "./task-status-pill";
import { PriorityPill } from "./priority-pill";

export interface TaskCardData {
  id: string;
  taskCode: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  villaCode: string | null;
  scheduledFor: string | null;
  dueAt?: string | null;
  assignedToName: string | null;
}

export function TaskCard({
  task,
  href,
}: {
  task: TaskCardData;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-line-soft bg-surface p-4 flex items-start justify-between gap-3 hover:border-line-strong transition-colors active:translate-y-[1px]"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-ink-tertiary">{task.taskCode}</span>
          <PriorityPill priority={task.priority} />
          {task.scheduledFor && (
            <span className="text-[11px] text-ink-tertiary tabular-nums">
              {task.scheduledFor}
            </span>
          )}
        </div>
        <div className="text-ink font-medium text-sm mt-2">{task.title}</div>
        <div className="text-xs text-ink-secondary mt-0.5 capitalize">
          {task.category.replace(/_/g, " ")}
          {task.villaCode ? ` · ${task.villaCode}` : ""}
          {task.assignedToName ? ` · ${task.assignedToName}` : ""}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <TaskStatusPill status={task.status} />
        <ChevronRight className="w-4 h-4 text-ink-tertiary" />
      </div>
    </Link>
  );
}
