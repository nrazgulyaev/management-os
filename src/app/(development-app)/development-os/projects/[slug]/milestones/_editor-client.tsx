"use client";

/**
 * Phase 2.2 dev-01 — Milestones editor (client).
 *
 * Flat list with status select + dependency indicator per spec.
 * Drag-to-reorder ships in 2.2 data-wiring (needs server-side
 * mutation + `@dnd-kit`); today reorder is keyboard-only via the
 * ↑/↓ buttons on each row so the API is provable.
 *
 * "Add milestone" CTA opens the AddMilestoneModal from PR 3.
 */

import * as React from "react";
import { MilestoneRow, type MilestoneRowMilestone, type MilestoneStatus } from "@/components/projects/milestone-row";
import { AddMilestoneModal, type AddMilestoneValues } from "@/components/projects/add-milestone-modal";

export interface MilestonesEditorProps {
  projectSlug: string;
  initial: MilestoneRowMilestone[];
}

export function MilestonesEditor({ projectSlug, initial }: MilestonesEditorProps) {
  const [milestones, setMilestones] = React.useState<MilestoneRowMilestone[]>(initial);
  const [addOpen, setAddOpen] = React.useState(false);

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
    setMilestones((p) => p.map((m) => (m.id === id ? { ...m, status } : m)));
  }

  function handleAdd(values: AddMilestoneValues) {
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
  }

  return (
    <>
      <div className="ms-editor-toolbar">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setAddOpen(true)}
        >
          + Add milestone
        </button>
        <span className="mono ml-auto text-[10px] text-ink-3 uppercase tracking-[0.12em]">
          {milestones.length} milestones · drag-to-reorder ships in 2.2 data
        </span>
      </div>
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
          </div>
        ))}
      </div>
      <AddMilestoneModal
        open={addOpen}
        onOpenChange={setAddOpen}
        milestones={milestones.map((m) => ({ id: m.id, name: m.name }))}
        onSubmit={handleAdd}
      />
      <p className="mono mt-4 text-[10px] text-ink-3" style={{ letterSpacing: "0.12em" }}>
        PROJECT: {projectSlug.toUpperCase()}
      </p>
    </>
  );
}
