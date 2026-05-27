"use client";

/**
 * Phase 2.2 dev-01 — MilestoneRow.
 *
 * Shared between the milestone editor (full row with drag handle +
 * status select + dependency indicator) and the Overview tab's
 * upcoming-milestones panel (compact read-only summary).
 */

import * as React from "react";

export type MilestoneStatus = "planned" | "in_progress" | "done" | "blocked" | "slipping";

export interface MilestoneRowMilestone {
  id: string;
  name: string;
  targetDate: string;
  actualDate?: string;
  status: MilestoneStatus;
  ownerName?: string;
  /** Number of upstream dependencies (rendered as a glyph). */
  dependencyCount?: number;
  /** Days late (positive) or early (negative). Computed by caller. */
  slipDays?: number;
}

export interface MilestoneRowProps {
  milestone: MilestoneRowMilestone;
  /** Editor variant — adds drag handle + inline status select. */
  editable?: boolean;
  /** Drag handle props (caller wires up via @dnd-kit or similar). */
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  /** Called when the status select changes (editor only). */
  onStatusChange?: (next: MilestoneStatus) => void;
  /** Optional click → open the milestone detail sheet. */
  onSelect?: () => void;
  className?: string;
}

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
  slipping: "Slipping",
};

const STATUS_TONE: Record<MilestoneStatus, string> = {
  planned: "",
  in_progress: "in-progress",
  done: "done",
  blocked: "blocked",
  slipping: "slipping",
};

export function MilestoneRow({
  milestone,
  editable,
  dragHandleProps,
  onStatusChange,
  onSelect,
  className,
}: MilestoneRowProps) {
  const slip = milestone.slipDays ?? 0;
  return (
    <div
      className={`milestone-row ${editable ? "editable" : ""} ${className ?? ""}`}
      onClick={onSelect && !editable ? onSelect : undefined}
      role={onSelect && !editable ? "button" : undefined}
      tabIndex={onSelect && !editable ? 0 : undefined}
    >
      {editable && (
        <span className="drag-handle" aria-label="Drag to reorder" {...dragHandleProps}>
          ⋮⋮
        </span>
      )}
      <span className={`status-dot ${STATUS_TONE[milestone.status]}`} aria-hidden />
      <div className="ms-body">
        <div className="name">{milestone.name}</div>
        <div className="meta">
          <span className="mono">{milestone.targetDate}</span>
          {slip > 0 && <span className="slip">+{slip}d slip</span>}
          {slip < 0 && <span className="early">{slip}d</span>}
          {milestone.ownerName && <span>· {milestone.ownerName}</span>}
          {milestone.dependencyCount !== undefined && milestone.dependencyCount > 0 && (
            <span className="deps" title={`${milestone.dependencyCount} dependencies`}>
              ⇠ {milestone.dependencyCount}
            </span>
          )}
        </div>
      </div>
      {editable ? (
        <select
          className="status-select"
          value={milestone.status}
          onChange={(e) => onStatusChange?.(e.target.value as MilestoneStatus)}
          aria-label="Status"
        >
          {(Object.keys(STATUS_LABEL) as MilestoneStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      ) : (
        <span className={`status-pill ${STATUS_TONE[milestone.status]}`}>
          {STATUS_LABEL[milestone.status]}
        </span>
      )}
    </div>
  );
}
