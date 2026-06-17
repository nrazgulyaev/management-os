"use client";

/**
 * MISSING_CRUD — resource detail page actions.
 *
 * The resource detail page was read-only. assignResourceToTask /
 * editResourcePool / archiveResourcePool already exist as org-scoped
 * "use server" actions — these self-contained modal islands mount the
 * missing UI (task picker + dates + capacity, plus Edit/Deactivate).
 * Follows the project-cycle/_input-forms.tsx modal pattern. No
 * client-supplied organizationId is passed.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  assignResourceToTask,
  editResourcePool,
  archiveResourcePool,
} from "@/lib/development/server/schedule/resource-pool-actions";

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

const RESOURCE_TYPES = [
  ["vendor_team", "Vendor team"],
  ["internal_team", "Internal team"],
  ["individual", "Individual"],
  ["equipment", "Equipment"],
  ["subcontractor", "Subcontractor"],
] as const;

const CAPACITY_UNITS = [
  ["hours", "Hours"],
  ["days", "Days"],
  ["units", "Units"],
] as const;

const ASSIGN_STATUSES = [
  ["planned", "Planned"],
  ["confirmed", "Confirmed"],
  ["in_progress", "In progress"],
] as const;

type ResourceType = (typeof RESOURCE_TYPES)[number][0];
type CapacityUnit = (typeof CAPACITY_UNITS)[number][0];
type AssignStatus = "planned" | "confirmed" | "in_progress" | "completed" | "cancelled";

export interface TaskOption {
  id: string;
  taskCode: string | null;
  name: string;
}

export interface ResourceControlsProps {
  resource: {
    id: string;
    displayName: string;
    resourceType: string;
    capacityUnit: string;
    totalCapacityPerDay: string | null;
    skills: string[];
    notes: string | null;
  };
  tasks: TaskOption[];
}

export function ResourceControls({ resource, tasks }: ResourceControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AssignToTaskButton
        resourceId={resource.id}
        defaultCapacity={resource.totalCapacityPerDay}
        tasks={tasks}
      />
      <EditResourceButton resource={resource} />
      <DeactivateResourceButton id={resource.id} name={resource.displayName} />
    </div>
  );
}

function AssignToTaskButton({
  resourceId,
  defaultCapacity,
  tasks,
}: {
  resourceId: string;
  defaultCapacity: string | null;
  tasks: TaskOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => (fd.get(k) ?? "").toString().trim();
    const taskId = str("taskId");
    if (!taskId) {
      setErr("Select a task to assign.");
      return;
    }
    start(async () => {
      const r = await assignResourceToTask({
        taskId,
        resourceId,
        allocatedCapacityPerDay: Number(fd.get("allocatedCapacityPerDay") ?? 0),
        allocationStart: str("allocationStart"),
        allocationEnd: str("allocationEnd"),
        status: str("status") as AssignStatus,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => { setErr(null); setOpen(true); }}>
        Assign to task
      </Button>
      {open && (
        <ModalShell title="Assign to task" onClose={() => setOpen(false)}>
          {tasks.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-secondary">
                No project tasks are available to assign yet. Create tasks under a
                project work package first.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <L label="Task" span2>
                  <select name="taskId" required className={inputCls} defaultValue="">
                    <option value="" disabled>Select task…</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.taskCode ? `${t.taskCode} · ` : ""}{t.name}
                      </option>
                    ))}
                  </select>
                </L>
                <L label="Allocation start">
                  <input type="date" name="allocationStart" required className={inputCls} />
                </L>
                <L label="Allocation end">
                  <input type="date" name="allocationEnd" required className={inputCls} />
                </L>
                <L label="Capacity / day">
                  <input
                    type="number"
                    name="allocatedCapacityPerDay"
                    min={0.01}
                    step="any"
                    required
                    defaultValue={defaultCapacity ?? undefined}
                    className={inputCls}
                  />
                </L>
                <L label="Status">
                  <select name="status" className={inputCls} defaultValue="planned">
                    {ASSIGN_STATUSES.map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                </L>
              </div>
              <FormFooter pending={pending} err={err} onCancel={() => setOpen(false)} submitLabel="Assign" busyLabel="Assigning…" />
            </form>
          )}
        </ModalShell>
      )}
    </>
  );
}

function EditResourceButton({
  resource,
}: {
  resource: ResourceControlsProps["resource"];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => (fd.get(k) ?? "").toString().trim();
    const capRaw = str("totalCapacityPerDay");
    const skillsRaw = str("skills");
    start(async () => {
      const r = await editResourcePool({
        id: resource.id,
        displayName: str("displayName"),
        resourceType: str("resourceType") as ResourceType,
        capacityUnit: str("capacityUnit") as CapacityUnit,
        totalCapacityPerDay: capRaw === "" ? null : Number(capRaw),
        skills: skillsRaw
          ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        notes: str("notes") || null,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => { setErr(null); setOpen(true); }}>
        Edit
      </Button>
      {open && (
        <ModalShell title="Edit resource" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <L label="Display name" span2>
                <input name="displayName" required minLength={2} defaultValue={resource.displayName} className={inputCls} />
              </L>
              <L label="Type">
                <select name="resourceType" className={inputCls} defaultValue={resource.resourceType}>
                  {RESOURCE_TYPES.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </L>
              <L label="Capacity unit">
                <select name="capacityUnit" className={inputCls} defaultValue={resource.capacityUnit}>
                  {CAPACITY_UNITS.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </L>
              <L label="Capacity / day">
                <input
                  type="number"
                  name="totalCapacityPerDay"
                  min={0}
                  step="any"
                  defaultValue={resource.totalCapacityPerDay ?? undefined}
                  className={inputCls}
                />
              </L>
              <L label="Skills (comma-separated)" span2>
                <input name="skills" defaultValue={resource.skills.join(", ")} className={inputCls} placeholder="masonry, plumbing…" />
              </L>
              <L label="Notes" span2>
                <input name="notes" defaultValue={resource.notes ?? ""} className={inputCls} />
              </L>
            </div>
            <FormFooter pending={pending} err={err} onCancel={() => setOpen(false)} submitLabel="Save changes" busyLabel="Saving…" />
          </form>
        </ModalShell>
      )}
    </>
  );
}

function DeactivateResourceButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function confirm() {
    setErr(null);
    start(async () => {
      const r = await archiveResourcePool({ id });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(null); setOpen(true); }}
        className="text-sm px-3 py-1.5 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5"
      >
        Deactivate
      </button>
      {open && (
        <ModalShell title="Deactivate resource" onClose={() => setOpen(false)}>
          <p className="text-sm text-ink-secondary mb-4">
            Deactivate <span className="font-medium text-ink">{name}</span>? It
            will be marked inactive and hidden from active resource lists.
          </p>
          <FormFooter
            pending={pending}
            err={err}
            onCancel={() => setOpen(false)}
            onSubmit={confirm}
            submitLabel="Deactivate"
            busyLabel="Deactivating…"
            danger
          />
        </ModalShell>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared modal primitives (local — mirrors _input-forms.tsx markup).
// ---------------------------------------------------------------------------

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function FormFooter({
  pending,
  err,
  onCancel,
  onSubmit,
  submitLabel,
  busyLabel,
  danger,
}: {
  pending: boolean;
  err: string | null;
  onCancel: () => void;
  onSubmit?: () => void;
  submitLabel: string;
  busyLabel: string;
  danger?: boolean;
}) {
  return (
    <>
      {err && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type={onSubmit ? "button" : "submit"}
          onClick={onSubmit}
          disabled={pending}
          className={
            danger
              ? "text-sm px-3 py-1.5 rounded bg-danger text-white hover:opacity-90 disabled:opacity-50"
              : "text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
          }
        >
          {pending ? busyLabel : submitLabel}
        </button>
      </div>
    </>
  );
}

function L({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}
