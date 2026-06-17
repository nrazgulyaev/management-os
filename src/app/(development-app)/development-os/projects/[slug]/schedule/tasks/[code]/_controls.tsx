"use client";

/**
 * Task lifecycle controls: status transition, progress %, mark-complete, an
 * inline edit (name / planned dates / notes), and an add-dependency picker
 * (this task as predecessor or successor of a sibling task). All wired to the
 * org-scoped schedule actions.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  updateProjectTaskAction,
  setTaskProgressAction,
  completeTaskAction,
  addTaskDependencyAction,
} from "./_actions";

const STATUSES = [
  "planned",
  "ready_to_start",
  "in_progress",
  "completed",
  "blocked",
  "cancelled",
] as const;

type TaskStatus = (typeof STATUSES)[number];

const DEP_TYPES = [
  "finish_to_start",
  "start_to_start",
  "finish_to_finish",
  "start_to_finish",
] as const;

export function TaskStatusProgressControls({
  taskId,
  status,
  progressPercentage,
}: {
  taskId: string;
  status: string;
  progressPercentage: number;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [newStatus, setNewStatus] = React.useState<TaskStatus>(
    (status as TaskStatus) ?? "planned",
  );
  const [progress, setProgress] = React.useState(String(progressPercentage));

  function applyStatus() {
    setError(null);
    start(async () => {
      const res = await updateProjectTaskAction({ taskId, status: newStatus });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function applyProgress() {
    setError(null);
    const pct = Number(progress);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError("Progress must be between 0 and 100.");
      return;
    }
    start(async () => {
      const res = await setTaskProgressAction({
        taskId,
        progressPercentage: pct,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function complete() {
    setError(null);
    start(async () => {
      const res = await completeTaskAction({ taskId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="text-ink-secondary">Status</span>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
            className="mt-1 block rounded border border-line-soft p-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={applyStatus}
          className="btn btn-secondary btn-sm"
        >
          Set status
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="text-ink-secondary">Progress %</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
            className="mt-1 block w-24 rounded border border-line-soft p-2 text-sm font-mono text-right"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={applyProgress}
          className="btn btn-secondary btn-sm"
        >
          Save progress
        </button>
        <button
          type="button"
          disabled={pending || status === "completed"}
          onClick={complete}
          className="btn btn-dark btn-sm"
        >
          {status === "completed" ? "Completed" : "Mark complete"}
        </button>
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function TaskEditControls({
  taskId,
  name,
  plannedStart,
  plannedFinish,
  notes,
}: {
  taskId: string;
  name: string;
  plannedStart: string;
  plannedFinish: string;
  notes: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [n, setN] = React.useState(name);
  const [ps, setPs] = React.useState(plannedStart);
  const [pf, setPf] = React.useState(plannedFinish);
  const [nt, setNt] = React.useState(notes ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!n.trim()) {
      setError("Name is required.");
      return;
    }
    if (pf < ps) {
      setError("Planned finish must be on or after planned start.");
      return;
    }
    start(async () => {
      const res = await updateProjectTaskAction({
        taskId,
        name: n.trim(),
        plannedStart: ps,
        plannedFinish: pf,
        notes: nt.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary btn-sm"
      >
        Edit task
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <label className="block text-sm">
        <span className="text-ink-secondary">Name</span>
        <input
          type="text"
          value={n}
          onChange={(e) => setN(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Planned start</span>
          <input
            type="date"
            value={ps}
            onChange={(e) => setPs(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Planned finish</span>
          <input
            type="date"
            value={pf}
            onChange={(e) => setPf(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-ink-secondary">Notes</span>
        <textarea
          value={nt}
          onChange={(e) => setNt(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="btn btn-secondary btn-sm"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}

export function AddDependencyControl({
  taskId,
  slug,
  taskCode,
  candidates,
}: {
  taskId: string;
  slug: string;
  taskCode: string;
  candidates: Array<{ id: string; taskCode: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [otherId, setOtherId] = React.useState("");
  const [direction, setDirection] = React.useState<"predecessor" | "successor">(
    "predecessor",
  );
  const [type, setType] = React.useState<(typeof DEP_TYPES)[number]>(
    "finish_to_start",
  );
  const [lagDays, setLagDays] = React.useState("0");

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary">
        No other tasks in this project to depend on yet.
      </p>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!otherId) {
      setError("Pick a task to link.");
      return;
    }
    // direction=predecessor → the picked task is THIS task's predecessor.
    const predecessorId = direction === "predecessor" ? otherId : taskId;
    const successorId = direction === "predecessor" ? taskId : otherId;
    start(async () => {
      const res = await addTaskDependencyAction({
        predecessorId,
        successorId,
        slug,
        taskCode,
        type,
        lagDays: Number(lagDays) || 0,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOtherId("");
      setLagDays("0");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary btn-sm"
      >
        + Add dependency
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded border border-line-soft bg-surface p-3 space-y-2 max-w-2xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="text-ink-secondary">Direction</span>
          <select
            value={direction}
            onChange={(e) =>
              setDirection(e.target.value as "predecessor" | "successor")
            }
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            <option value="predecessor">This task depends on… (predecessor)</option>
            <option value="successor">…depends on this task (successor)</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Other task</span>
          <select
            value={otherId}
            onChange={(e) => setOtherId(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            <option value="">Select…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.taskCode} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Dependency type</span>
          <select
            value={type}
            onChange={(e) =>
              setType(e.target.value as (typeof DEP_TYPES)[number])
            }
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {DEP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Lag (days)</span>
          <input
            type="number"
            step={1}
            value={lagDays}
            onChange={(e) => setLagDays(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono text-right"
          />
        </label>
      </div>
      <p className="text-[11px] text-ink-tertiary">
        Cycles are rejected automatically — a dependency that would loop back on
        itself cannot be created.
      </p>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
          {pending ? "Saving…" : "Add dependency"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="btn btn-secondary btn-sm"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}
