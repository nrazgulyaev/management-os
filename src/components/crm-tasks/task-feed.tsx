"use client";

/**
 * <TaskFeed> — read-mostly list of CRM follow-ups for the "My tasks" /
 * due-today views. Each row can be marked done inline (org-scoped, audited
 * server action) and deep-links to its CRM subject record when one exists.
 *
 * Layer-B tokens + @/components/ui primitives only.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowUpRight } from "lucide-react";
import { completeTask } from "@/features/crm-tasks/actions";
import {
  subjectHref,
  subjectTypeLabel,
  type CrmTaskView,
} from "@/features/crm-tasks/types";

export interface TaskFeedProps {
  tasks: CrmTaskView[];
  /** When false, rows render read-only (no complete affordance). */
  canManage: boolean;
  /** Show the assignee chip (org/team views); omit on a single user's list. */
  showAssignee?: boolean;
  emptyLabel?: string;
}

function formatDue(iso: string | null): string {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskFeed({
  tasks,
  canManage,
  showAssignee = false,
  emptyLabel = "Nothing here.",
}: TaskFeedProps) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onDone(t: CrmTaskView) {
    if (!canManage) return;
    setBusyId(t.id);
    setError(null);
    const res = await completeTask({ id: t.id, done: true });
    setBusyId(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  if (tasks.length === 0) {
    return <p className="text-[13px] text-ink-tertiary py-2">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {tasks.map((t) => {
          const href = subjectHref(t.subjectType, t.subjectId);
          return (
            <li
              key={t.id}
              className="flex items-start gap-3 rounded-[10px] border border-line-soft bg-surface px-3.5 py-3"
            >
              <button
                type="button"
                disabled={!canManage || busyId === t.id}
                onClick={() => onDone(t)}
                aria-label="Mark done"
                className="mt-0.5 shrink-0 text-ink-tertiary transition-colors hover:text-success disabled:opacity-50"
              >
                {t.status === "done" ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <span className="block size-5 rounded-full border-2 border-current" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-medium text-ink">
                    {t.title}
                  </span>
                  {t.overdue && <Badge tone="danger">Overdue</Badge>}
                  {!t.overdue && t.dueToday && <Badge tone="warning">Today</Badge>}
                  {t.priority === "high" && <Badge tone="danger">High</Badge>}
                </div>
                {t.body && (
                  <p className="mt-0.5 text-[12.5px] text-ink-secondary">{t.body}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-tertiary">
                  <Badge tone="outline">{subjectTypeLabel(t.subjectType)}</Badge>
                  <span>{formatDue(t.dueAt)}</span>
                  {showAssignee && (
                    <>
                      <span>·</span>
                      <span>{t.assigneeName ?? "Unassigned"}</span>
                    </>
                  )}
                  {href && (
                    <Link
                      href={href}
                      className="inline-flex items-center gap-0.5 text-accent hover:underline"
                    >
                      Open record
                      <ArrowUpRight className="size-3" />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
