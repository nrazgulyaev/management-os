/**
 * Stage 10.B — KanbanBoard primitive.
 *
 * Column-based pipeline view with draggable cards + per-card SLA aging
 * color. The drag-and-drop handler is opt-in: pass `onCardMove` to
 * enable interactive transitions; omit for read-only view.
 *
 * Used by: 10.I Marketing funnel (Inquiry → Hold → Quoted → Booked →
 * Stayed → Reviewed), 10.H Procurement queue, ops-manager exception
 * queue.
 *
 * Reference patterns: HubSpot deal pipeline, Pipedrive funnel, Trello
 * board (research-summary.md theme 2 + reference-apps/marketing.md).
 *
 * Client component (drag state + keyboard moves).
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface KanbanColumn {
  id: string;
  label: string;
  /** Optional WIP limit; cards beyond this turn the column header amber. */
  wipLimit?: number;
}

export interface KanbanCard {
  id: string;
  columnId: string;
  title: string;
  subtitle?: string;
  /** Hours since last interaction; drives SLA aging color. */
  ageHours?: number;
  /** Custom right-side meta (e.g. $ value). */
  meta?: React.ReactNode;
  /** Renders a small badge in the card header. */
  badge?: { label: string; tone?: "neutral" | "info" | "warn" | "danger" };
}

export interface KanbanBoardProps {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  onCardMove?: (cardId: string, toColumnId: string) => void;
  onCardClick?: (cardId: string) => void;
  /** SLA thresholds in hours. Default: warn 1h, danger 4h. */
  slaWarnHours?: number;
  slaDangerHours?: number;
  className?: string;
  /** Empty-column copy. */
  emptyColumnLabel?: string;
}

const BADGE_TONE = {
  neutral: "bg-muted text-ink-secondary",
  info: "bg-accent-weak text-accent",
  warn: "bg-warning-weak text-warning",
  danger: "bg-danger-weak text-danger",
};

export function KanbanBoard({
  columns,
  cards,
  onCardMove,
  onCardClick,
  slaWarnHours = 1,
  slaDangerHours = 4,
  className,
  emptyColumnLabel = "Drop here",
}: KanbanBoardProps) {
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  const cardsByCol = React.useMemo(() => {
    const map = new Map<string, KanbanCard[]>();
    for (const c of columns) map.set(c.id, []);
    for (const card of cards) {
      const arr = map.get(card.columnId);
      if (arr) arr.push(card);
    }
    return map;
  }, [columns, cards]);

  function ageColor(h?: number): string {
    if (h == null) return "border-l-line-soft";
    if (h >= slaDangerHours) return "border-l-danger";
    if (h >= slaWarnHours) return "border-l-warning";
    return "border-l-success";
  }

  return (
    <div
      className={cn(
        "flex gap-3 overflow-x-auto pb-2 items-start",
        className,
      )}
      role="list"
    >
      {columns.map((col) => {
        const colCards = cardsByCol.get(col.id) ?? [];
        const wipExceeded =
          col.wipLimit != null && colCards.length > col.wipLimit;
        return (
          <section
            key={col.id}
            className={cn(
              "flex-1 min-w-[260px] bg-muted rounded-md p-2 flex flex-col gap-2",
              dragOver === col.id && "ring-2 ring-accent",
            )}
            onDragOver={(e) => {
              if (!onCardMove) return;
              e.preventDefault();
              setDragOver(col.id);
            }}
            onDragLeave={() => setDragOver((d) => (d === col.id ? null : d))}
            onDrop={(e) => {
              if (!onCardMove) return;
              e.preventDefault();
              const cardId = e.dataTransfer.getData("text/plain");
              if (cardId) onCardMove(cardId, col.id);
              setDragOver(null);
            }}
            data-column-id={col.id}
          >
            <header
              className={cn(
                "flex items-center justify-between px-2 py-1 text-xs font-medium uppercase tracking-wider",
                wipExceeded ? "text-warning" : "text-ink-secondary",
              )}
            >
              <span>{col.label}</span>
              <span className="font-mono tabular-nums">
                {colCards.length}
                {col.wipLimit != null && ` / ${col.wipLimit}`}
              </span>
            </header>
            <div className="flex flex-col gap-2 min-h-[40px]">
              {colCards.length === 0 ? (
                <div className="text-xs text-ink-tertiary italic px-2 py-3 text-center">
                  {emptyColumnLabel}
                </div>
              ) : (
                colCards.map((card) => (
                  <article
                    key={card.id}
                    draggable={Boolean(onCardMove)}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", card.id)
                    }
                    onClick={() => onCardClick?.(card.id)}
                    className={cn(
                      "rounded-sm bg-surface border border-line-soft border-l-2 p-3 text-sm shadow-[var(--shadow-flat)]",
                      ageColor(card.ageHours),
                      onCardClick &&
                        "cursor-pointer hover:shadow-[var(--shadow-rest)]",
                    )}
                    data-card-id={card.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-ink truncate">
                          {card.title}
                        </div>
                        {card.subtitle && (
                          <div className="text-xs text-ink-tertiary truncate mt-0.5">
                            {card.subtitle}
                          </div>
                        )}
                      </div>
                      {card.badge && (
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-sm font-medium",
                            BADGE_TONE[card.badge.tone ?? "neutral"],
                          )}
                        >
                          {card.badge.label}
                        </span>
                      )}
                    </div>
                    {(card.meta != null || card.ageHours != null) && (
                      <div className="flex items-center justify-between mt-2 text-xs text-ink-tertiary">
                        {card.meta ?? <span />}
                        {card.ageHours != null && (
                          <span className="tabular-nums">
                            {card.ageHours < 1
                              ? `${Math.round(card.ageHours * 60)}m`
                              : `${card.ageHours.toFixed(1)}h`}
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
