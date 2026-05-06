"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createProjectTask,
  setTaskDependency,
} from "@/lib/development/server/schedule/schedule-actions";

const DEP_TYPES = [
  "finish_to_start",
  "start_to_start",
  "finish_to_finish",
  "start_to_finish",
] as const;

export function TaskForm({
  workPackages,
  existingTasks,
  projectSlug,
  defaultWorkPackageId,
}: {
  workPackages: Array<{ id: string; packageCode: string; name: string }>;
  existingTasks: Array<{ id: string; taskCode: string; name: string }>;
  projectSlug: string;
  defaultWorkPackageId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [taskCode, setTaskCode] = useState("");
  const [name, setName] = useState("");
  const [workPackageId, setWorkPackageId] = useState(
    defaultWorkPackageId ?? workPackages[0]?.id ?? "",
  );
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedFinish, setPlannedFinish] = useState("");
  const [predecessorId, setPredecessorId] = useState("");
  const [depType, setDepType] = useState<typeof DEP_TYPES[number]>("finish_to_start");
  const [lagDays, setLagDays] = useState("0");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!taskCode.trim() || !name.trim()) {
      setError("Code and name are required");
      return;
    }
    if (!plannedStart || !plannedFinish) {
      setError("Planned start and finish are required");
      return;
    }
    if (plannedFinish < plannedStart) {
      setError("Finish date must be on or after start date");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createProjectTask({
          taskCode,
          name,
          workPackageId,
          plannedStart,
          plannedFinish,
        });
        if (predecessorId) {
          await setTaskDependency({
            predecessorId,
            successorId: out.id,
            type: depType,
            lagDays: Number(lagDays) || 0,
          });
        }
        router.push(
          `/development-os/projects/${projectSlug}/schedule/tasks/${out.taskCode}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Task code</span>
          <input
            type="text"
            value={taskCode}
            onChange={(e) => setTaskCode(e.target.value)}
            placeholder="TSK-ETV-001"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Foundation slab pour"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            required
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">Work package</span>
        <select
          value={workPackageId}
          onChange={(e) => setWorkPackageId(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        >
          {workPackages.map((wp) => (
            <option key={wp.id} value={wp.id}>
              {wp.packageCode} — {wp.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Planned start</span>
          <input
            type="date"
            value={plannedStart}
            onChange={(e) => setPlannedStart(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Planned finish</span>
          <input
            type="date"
            value={plannedFinish}
            onChange={(e) => setPlannedFinish(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            required
          />
        </label>
      </div>

      <fieldset className="border border-line-soft rounded p-3 space-y-2">
        <legend className="text-xs uppercase tracking-wide text-ink-tertiary px-1">
          Dependency (optional)
        </legend>
        <label className="block text-sm">
          <span className="text-ink-secondary">Predecessor task</span>
          <select
            value={predecessorId}
            onChange={(e) => setPredecessorId(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            <option value="">— None —</option>
            {existingTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.taskCode} — {t.name}
              </option>
            ))}
          </select>
        </label>
        {predecessorId && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">Type</span>
              <select
                value={depType}
                onChange={(e) =>
                  setDepType(e.target.value as typeof depType)
                }
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              >
                {DEP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Lag days</span>
              <input
                type="number"
                step="1"
                value={lagDays}
                onChange={(e) => setLagDays(e.target.value)}
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
              />
            </label>
          </div>
        )}
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Create task
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
