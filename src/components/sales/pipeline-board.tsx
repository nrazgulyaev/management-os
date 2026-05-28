"use client";

/**
 * Phase 2.4 seed — PipelineBoard.
 *
 * 5-lane kanban (Lead / Qualified / Tour / Contract / Closed) on
 * @dnd-kit. Stage transitions on drop emit a single onMove event
 * with (cardId, fromLane, toLane, position) — caller writes to DB.
 *
 * See src/styles/components/p24-primitives.css for .pb-* classes.
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
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface PipelineLane {
  id: string;
  label: string;
  /** Lane accent color (CSS var or hex). */
  color?: string;
}

export interface PipelineCard {
  id: string;
  laneId: string;
  title: string;
  sub?: string;
  /** Right-aligned KPI ("$1.2M", "32d", etc). */
  metric?: string;
  /** Optional badge text (e.g. "Hot", "Cold lead"). */
  badge?: { text: string; tone: "neutral" | "warm" | "warn" | "ok" };
  /** Avatar / owner initials. */
  ownerInitials?: string;
}

export interface PipelineBoardProps {
  lanes: PipelineLane[];
  cards: PipelineCard[];
  onMove?: (cardId: string, fromLane: string, toLane: string, position: number) => void;
  onCardClick?: (cardId: string) => void;
  mobileMode?: "auto" | "single-lane";
  className?: string;
}

export function PipelineBoard({ lanes, cards, onMove, onCardClick, mobileMode, className }: PipelineBoardProps) {
  const [items, setItems] = React.useState(cards);
  React.useEffect(() => setItems(cards), [cards]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = [...items];
    const fromIdx = next.findIndex((c) => c.id === active.id);
    const toIdx = next.findIndex((c) => c.id === over.id);
    if (fromIdx < 0) return;
    const fromCard = next[fromIdx];
    const targetLane = toIdx >= 0 ? next[toIdx].laneId : String(over.id);
    next.splice(fromIdx, 1);
    const insertIdx = toIdx >= 0 ? next.findIndex((c) => c.id === over.id) : next.length;
    const updated = { ...fromCard, laneId: targetLane };
    next.splice(insertIdx, 0, updated);
    setItems(next);
    const positionInLane = next.filter((c) => c.laneId === targetLane).findIndex((c) => c.id === updated.id);
    if (fromCard.laneId !== targetLane) {
      onMove?.(fromCard.id, fromCard.laneId, targetLane, positionInLane);
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className={`pipeline-board${mobileMode === "single-lane" ? " mobile-single" : ""}${className ? ` ${className}` : ""}`}>
        {lanes.map((lane) => {
          const laneCards = items.filter((c) => c.laneId === lane.id);
          return (
            <div className="pb-lane" key={lane.id} data-lane-id={lane.id}>
              <header className="pb-lane-head" style={lane.color ? { ["--lane" as string]: lane.color } : undefined}>
                <span className="pb-lane-label">{lane.label}</span>
                <span className="pb-lane-count mono">{laneCards.length}</span>
              </header>
              <SortableContext items={laneCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="pb-lane-body">
                  {laneCards.map((c) => (
                    <SortableCard key={c.id} card={c} onClick={() => onCardClick?.(c.id)} />
                  ))}
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}

function SortableCard({ card, onClick }: { card: PipelineCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="pb-card" {...attributes} {...listeners} onClick={onClick}>
      <div className="pb-card-head">
        <span className="pb-card-title">{card.title}</span>
        {card.metric && <span className="pb-card-metric mono">{card.metric}</span>}
      </div>
      {card.sub && <div className="pb-card-sub">{card.sub}</div>}
      <div className="pb-card-foot">
        {card.badge && <span className={`pb-card-badge pb-tone-${card.badge.tone}`}>{card.badge.text}</span>}
        {card.ownerInitials && <span className="pb-card-owner mono">{card.ownerInitials}</span>}
      </div>
    </div>
  );
}
