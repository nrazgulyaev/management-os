"use client";

/**
 * Sales workspace view switcher — toggles between the existing read-only
 * "List" board (status columns, click-through cards) and the new interactive
 * "Pipeline" Kanban (drag a card between stages → guarded FSM transition).
 *
 * Both views read the same `leads` prop; only the Pipeline view persists stage
 * changes via the `moveLeadStage` server action. Cream/stone/ink tokens +
 * @/components/ui primitives only.
 */

import * as React from "react";
import { KanbanSquare, List } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LeadPipelineBoard,
  type LeadPipelineBoardProps,
} from "./lead-pipeline-board";
import { LeadKanbanBoard } from "./lead-kanban-board";

type ViewMode = "list" | "pipeline";

export interface SalesPipelineViewsProps extends LeadPipelineBoardProps {
  /** Default view on first render. */
  defaultView?: ViewMode;
}

export function SalesPipelineViews({
  defaultView = "list",
  ...boardProps
}: SalesPipelineViewsProps) {
  const [view, setView] = React.useState<ViewMode>(defaultView);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 self-start rounded-full border border-line-soft bg-muted p-1">
        <ViewTab
          active={view === "list"}
          onClick={() => setView("list")}
          icon={<List className="w-3.5 h-3.5" strokeWidth={1.75} />}
          label="List"
        />
        <ViewTab
          active={view === "pipeline"}
          onClick={() => setView("pipeline")}
          icon={<KanbanSquare className="w-3.5 h-3.5" strokeWidth={1.75} />}
          label="Pipeline"
        />
      </div>

      {view === "list" ? (
        <LeadPipelineBoard {...boardProps} />
      ) : (
        <LeadKanbanBoard
          leads={boardProps.leads}
          pendingDraftsByRoleId={boardProps.pendingDraftsByRoleId}
        />
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-medium transition-colors",
        active
          ? "bg-accent text-accent-contrast"
          : "text-ink-tertiary hover:text-ink-secondary",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
