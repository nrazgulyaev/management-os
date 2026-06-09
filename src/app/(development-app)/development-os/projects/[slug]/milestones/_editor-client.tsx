"use client";

/**
 * Phase 2.2 dev-01 — Milestones editor (client).
 *
 * Flat list with status select + dependency indicator per spec. Now
 * persists to the real `milestones` table via the server actions
 * (createMilestone / updateMilestone / deleteMilestone) when a live
 * `projectId` is supplied; falls back to local-state-only when the editor
 * is seeded from synthesized phase rows (no real project id yet).
 *
 * Drag-to-reorder is still keyboard-only via the ↑/↓ buttons (reorder is
 * not persisted — the `milestones` table has no ordinal column; ordering is
 * by target date).
 *
 * "Add milestone" CTA opens the AddMilestoneModal from PR 3.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { MilestoneRow, type MilestoneRowMilestone, type MilestoneStatus } from "@/components/projects/milestone-row";
import { AddMilestoneModal, type AddMilestoneValues } from "@/components/projects/add-milestone-modal";
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from "@/lib/development/server/project-milestone-actions";

export interface MilestonesEditorProps {
  projectSlug: string;
  /**
   * Real project UUID. When present (DB-backed project) "+ Add" persists a
   * new row to the `milestones` table; absent, every interaction is local.
   */
  projectId?: string;
  /**
   * Whether `initial` came from the real `milestones` table. When false the
   * listed rows are synthesized from project phases (their ids are not real
   * milestone ids), so status/delete on them stay local-only — but adding a
   * new milestone still persists and, on refresh, flips this surface real.
   */
  persistent?: boolean;
  initial: MilestoneRowMilestone[];
}

export function MilestonesEditor({
  projectSlug,
  projectId,
  persistent = false,
  initial,
}: MilestonesEditorProps) {
  const router = useRouter();
  const [milestones, setMilestones] = React.useState<MilestoneRowMilestone[]>(initial);
  const [addOpen, setAddOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMilestones(initial);
  }, [initial]);

  // Add always persists for a DB-backed project. Status/delete only persist
  // when the listed rows themselves are real milestone rows.
  const canCreate = !!projectId;
  const canPersist = persistent && !!projectId;

  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= milestones.length) return;
    setMilestones((p) => {
      const out = [...p];
      [out[idx], out[next]] = [out[next], out[idx]];
      return out;
    });
  }

  function setStatus(id: string, status: MilestoneStatus) {
    // Optimistic local update for snappy feedback.
    setMilestones((p) => p.map((m) => (m.id === id ? { ...m, status } : m)));
    if (!canPersist || !projectId) return;
    setError(null);
    startTransition(async () => {
      const res = await updateMilestone({ milestoneId: id, projectSlug, status });
      if (!res.ok) {
        setError(res.error ?? "Could not save status.");
      }
      router.refresh();
    });
  }

  function handleAdd(values: AddMilestoneValues) {
    if (!canCreate || !projectId) {
      // No DB-backed project — keep the original local-only behaviour.
      setMilestones((p) => [
        ...p,
        {
          id: `m-${Date.now()}`,
          name: values.name,
          targetDate: values.targetDate,
          status: "planned",
          ownerName: values.ownerId ?? undefined,
          dependencyCount: values.dependsOn.length,
        },
      ]);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createMilestone({
        projectId,
        projectSlug,
        name: values.name,
        targetDate: values.targetDate,
        ownerStaffId: values.ownerId ?? undefined,
        // Dependency ids are only real milestone ids when the listed rows are
        // persisted; synthesized-phase ids are not valid milestone ids.
        dependsOn: persistent ? values.dependsOn : [],
      });
      if (!res.ok) {
        setError(res.error ?? "Could not add milestone.");
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!canPersist || !projectId) {
      setMilestones((p) => p.filter((m) => m.id !== id));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteMilestone({ milestoneId: id, projectSlug });
      if (!res.ok) {
        setError(res.error ?? "Could not delete milestone.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="ms-editor-toolbar">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setAddOpen(true)}
          disabled={pending}
        >
          + Add milestone
        </button>
        <span className="mono ml-auto text-[10px] text-ink-3 uppercase tracking-[0.12em]">
          {milestones.length} milestones
          {canPersist
            ? " · saved"
            : canCreate
              ? " · preview (phases) · add to author"
              : " · preview (local)"}
        </span>
      </div>
      {error && (
        <p className="mono mt-2 text-[11px] text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="ms-editor-list">
        {milestones.map((m, i) => (
          <div key={m.id} className="ms-editor-row">
            <div className="ms-editor-reorder">
              <button
                type="button"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === milestones.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
            </div>
            <MilestoneRow
              milestone={m}
              editable
              onStatusChange={(next) => setStatus(m.id, next)}
            />
            <button
              type="button"
              className="ms-editor-delete"
              aria-label={`Delete ${m.name}`}
              title="Delete milestone"
              disabled={pending}
              onClick={() => handleDelete(m.id)}
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <AddMilestoneModal
        open={addOpen}
        onOpenChange={setAddOpen}
        milestones={milestones.map((m) => ({ id: m.id, name: m.name }))}
        onSubmit={handleAdd}
      />
      <p className="mono mt-4 text-[10px] text-ink-3 tracking-[0.12em]">
        PROJECT: {projectSlug.toUpperCase()}
      </p>
    </>
  );
}
