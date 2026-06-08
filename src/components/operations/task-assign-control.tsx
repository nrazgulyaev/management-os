"use client";

/**
 * Wire-up sweep — operation task assignment.
 *
 * `assignOperationTaskAction` already existed (real DB write + audit) but
 * no UI reached it — the task detail showed the assignee read-only. This
 * renders an inline staff selector over the existing action.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { assignOperationTaskAction } from "@/features/operations/actions";

export function TaskAssignControl({
  taskId,
  currentAssignedTo,
  currentName,
  staff,
}: {
  taskId: string;
  currentAssignedTo: string | null;
  currentName: string | null;
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const assignedTo = e.target.value;
    if (!assignedTo || assignedTo === currentAssignedTo) return;
    setErr(null);
    const fd = new FormData();
    fd.set("id", taskId);
    fd.set("assignedTo", assignedTo);
    start(async () => {
      const r = await assignOperationTaskAction(null, fd);
      if (!r.ok) {
        setErr(r.error ?? "Assign failed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-ink">
        {currentName ?? <span className="text-ink-tertiary">Unassigned</span>}
      </span>
      <select
        defaultValue={currentAssignedTo ?? ""}
        onChange={onChange}
        disabled={pending}
        className="text-xs px-2 py-1 rounded border border-line-soft bg-surface disabled:opacity-50"
        aria-label="Assign task to"
      >
        <option value="">Assign to…</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}
