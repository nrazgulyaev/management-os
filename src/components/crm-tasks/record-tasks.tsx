"use client";

/**
 * <RecordTasks> — the CRM follow-up / reminder panel that mounts on any CRM
 * record detail (owner / contact / lead / buyer / deal). Lists open + done
 * tasks for the subject, lets an internal user add a follow-up, mark it done,
 * and reassign it. All writes go through the org-scoped, audit-logged server
 * actions in @/features/crm-tasks/actions.
 *
 * Palette-agnostic Layer-B tokens + @/components/ui primitives only.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Plus, CheckCircle2 } from "lucide-react";
import {
  createTask,
  completeTask,
  reassignTask,
} from "@/features/crm-tasks/actions";
import type { CrmTaskView, CrmTaskSubjectType } from "@/features/crm-tasks/types";

export interface RecordTasksProps {
  subjectType: CrmTaskSubjectType;
  subjectId: string;
  tasks: CrmTaskView[];
  assignableUsers: { id: string; name: string }[];
  canManage: boolean;
}

function formatDue(iso: string | null): string {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityTone(p: CrmTaskView["priority"]): "danger" | "neutral" | "info" {
  if (p === "high") return "danger";
  if (p === "low") return "neutral";
  return "info";
}

export function RecordTasks({
  subjectType,
  subjectId,
  tasks,
  assignableUsers,
  canManage,
}: RecordTasksProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const openTasks = tasks.filter((t) => t.status === "open");
  const doneTasks = tasks.filter((t) => t.status === "done");

  async function onToggle(t: CrmTaskView) {
    if (!canManage) return;
    setBusyId(t.id);
    setError(null);
    const res = await completeTask({ id: t.id, done: t.status === "open" });
    setBusyId(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function onReassign(t: CrmTaskView, userId: string) {
    if (!canManage) return;
    setBusyId(t.id);
    setError(null);
    const res = await reassignTask({
      id: t.id,
      assigneeUserId: userId === "" ? null : userId,
    });
    setBusyId(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 px-7 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-[16px] text-ink">Follow-ups</h3>
          <p className="text-[12px] text-ink-tertiary">
            {openTasks.length} open · {doneTasks.length} done
          </p>
        </div>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add task
          </Button>
        )}
      </div>

      {error && (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          variant="first-run"
          title="No follow-ups yet"
          body="Add a reminder to call back, send a doc, or chase the next step."
          inline
          actions={
            canManage ? (
              <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                Add task
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {[...openTasks, ...doneTasks].map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-3 rounded-[10px] border border-line-soft bg-surface px-3.5 py-3"
            >
              <button
                type="button"
                disabled={!canManage || busyId === t.id}
                onClick={() => onToggle(t)}
                aria-label={t.status === "open" ? "Mark done" : "Reopen"}
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
                  <span
                    className={
                      "text-[13.5px] font-medium text-ink" +
                      (t.status === "done" ? " line-through text-ink-tertiary" : "")
                    }
                  >
                    {t.title}
                  </span>
                  {t.status === "open" && t.overdue && (
                    <Badge tone="danger">Overdue</Badge>
                  )}
                  {t.status === "open" && !t.overdue && t.dueToday && (
                    <Badge tone="warning">Today</Badge>
                  )}
                  {t.priority !== "normal" && (
                    <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                  )}
                </div>
                {t.body && (
                  <p className="mt-0.5 text-[12.5px] text-ink-secondary">{t.body}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-tertiary">
                  <span>{formatDue(t.dueAt)}</span>
                  <span>·</span>
                  {canManage && t.status === "open" ? (
                    <Select
                      value={t.assigneeUserId ?? ""}
                      disabled={busyId === t.id}
                      onChange={(e) => onReassign(t, e.target.value)}
                      className="h-6 py-0 text-[11.5px]"
                      aria-label="Assignee"
                    >
                      <option value="">Unassigned</option>
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span>{t.assigneeName ?? "Unassigned"}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <AddTaskModal
          open={open}
          onOpenChange={setOpen}
          subjectType={subjectType}
          subjectId={subjectId}
          assignableUsers={assignableUsers}
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AddTaskModal({
  open,
  onOpenChange,
  subjectType,
  subjectId,
  assignableUsers,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subjectType: CrmTaskSubjectType;
  subjectId: string;
  assignableUsers: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [dueAt, setDueAt] = React.useState("");
  const [priority, setPriority] = React.useState("normal");
  const [assignee, setAssignee] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const dirty = title.trim() !== "" || body.trim() !== "" || dueAt !== "";

  async function submit() {
    setError(null);
    if (title.trim() === "") {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    const res = await createTask({
      subjectType,
      subjectId,
      title: title.trim(),
      body: body.trim() === "" ? null : body.trim(),
      dueAt: dueAt === "" ? null : new Date(dueAt).toISOString(),
      priority: priority as "low" | "normal" | "high",
      assigneeUserId: assignee === "" ? null : assignee,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTitle("");
    setBody("");
    setDueAt("");
    setPriority("normal");
    setAssignee("");
    onCreated();
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" dirty={dirty}>
      <ModalHeader title="Add follow-up" />
      <ModalBody className="flex flex-col gap-3">
        <Field label="Title" htmlFor="crm-task-title">
          <Input
            id="crm-task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Call back about the contract"
            autoFocus
          />
        </Field>
        <Field label="Details (optional)" htmlFor="crm-task-body">
          <Textarea
            id="crm-task-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due" htmlFor="crm-task-due">
            <Input
              id="crm-task-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </Field>
          <Field label="Priority" htmlFor="crm-task-priority">
            <Select
              id="crm-task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </Field>
        </div>
        <Field label="Assign to" htmlFor="crm-task-assignee">
          <Select
            id="crm-task-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Me (default)</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        {error && (
          <p className="text-[12px] text-danger" role="alert">
            {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Adding…" : "Add task"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
