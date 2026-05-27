"use client";

/**
 * Phase 2.2 mgmt-04 — TurnoverBoard.
 *
 * 4-column kanban (To do / In progress / Inspection / Done). Uses
 * @dnd-kit/core + @dnd-kit/sortable for drag-between-columns. Disabled
 * on touch / narrow viewports — touch-friendly UX ships with the
 * Field portal in 2.5.
 *
 * Compact variant (`compact`) keeps the 4 columns visually but
 * limits each to 4 visible cards with a "+ N more" footer.
 */

import * as React from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StaffChip } from "./staff-chip";

export type TurnoverStatus = "todo" | "in-progress" | "inspection" | "done";

export interface TurnoverCard {
  id: string;
  villaCode: string;
  guestCheckOut: string;
  guestCheckIn?: string;
  status: TurnoverStatus;
  assignee?: { id: string; name: string } | null;
  /** Optional priority hint ("late", "deep clean"). */
  badge?: string;
}

export interface TurnoverBoardProps {
  turnovers: TurnoverCard[];
  compact?: boolean;
  onMove?: (id: string, status: TurnoverStatus) => void;
  className?: string;
}

const COLUMNS: { id: TurnoverStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "in-progress", label: "In progress" },
  { id: "inspection", label: "Inspection" },
  { id: "done", label: "Done" },
];

export function TurnoverBoard({ turnovers, compact, onMove, className }: TurnoverBoardProps) {
  const [items, setItems] = React.useState(turnovers);
  React.useEffect(() => setItems(turnovers), [turnovers]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = [...items];
    const fromIdx = next.findIndex((x) => x.id === active.id);
    const toIdx = next.findIndex((x) => x.id === over.id);
    if (fromIdx < 0 || toIdx < 0) return;
    const fromItem = next[fromIdx];
    const toItem = next[toIdx];
    const targetStatus = toItem.status;
    next.splice(fromIdx, 1);
    const toIdxAfter = next.findIndex((x) => x.id === over.id);
    next.splice(toIdxAfter, 0, { ...fromItem, status: targetStatus });
    setItems(next);
    if (fromItem.status !== targetStatus) onMove?.(fromItem.id, targetStatus);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className={`turnover-board${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}>
        {COLUMNS.map((col) => {
          const cards = items.filter((x) => x.status === col.id);
          const shown = compact ? cards.slice(0, 4) : cards;
          const overflow = cards.length - shown.length;
          return (
            <div className="tb-col" key={col.id}>
              <div className="tb-col-head">
                <span className="tb-col-label">{col.label}</span>
                <span className="tb-col-count mono">{cards.length}</span>
              </div>
              <SortableContext items={shown.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="tb-col-body">
                  {shown.map((c) => (
                    <SortableTurnoverCard key={c.id} card={c} />
                  ))}
                  {overflow > 0 && <div className="tb-overflow mono">+{overflow} more</div>}
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}

function SortableTurnoverCard({ card }: { card: TurnoverCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="tb-card" {...attributes} {...listeners}>
      <div className="tb-card-head">
        <span className="villa mono">{card.villaCode}</span>
        {card.badge && <span className="badge">{card.badge}</span>}
      </div>
      <div className="tb-card-meta mono">
        Out {card.guestCheckOut}
        {card.guestCheckIn && <> → In {card.guestCheckIn}</>}
      </div>
      <StaffChip staff={card.assignee ?? null} />
    </div>
  );
}
