"use client";

/**
 * Phase 2.1 PR 2 — SortableHeader.
 *
 * `<th>` wrapper that emits sort events and renders the arrow
 * indicator in the right tone (accent when sorted, neutral when not).
 * Click toggles asc → desc → none; shift-click is reserved for the
 * caller to handle multi-column sort if needed.
 */

import * as React from "react";

export type SortDirection = "asc" | "desc" | null;

export interface SortableHeaderProps {
  column: string;
  direction: SortDirection;
  /** Toggle order: asc → desc → none → asc. */
  onToggle: (next: SortDirection) => void;
  children: React.ReactNode;
  className?: string;
  /** Visual hint for numeric columns (right-aligned). */
  numeric?: boolean;
}

function nextDirection(d: SortDirection): SortDirection {
  if (d === "asc") return "desc";
  if (d === "desc") return null;
  return "asc";
}

export function SortableHeader({
  column,
  direction,
  onToggle,
  children,
  className,
  numeric,
}: SortableHeaderProps) {
  const ariaSort: React.AriaAttributes["aria-sort"] =
    direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none";
  const cls =
    "sortable" +
    (direction === "asc" ? " sorted-asc" : direction === "desc" ? " sorted-desc" : "") +
    (numeric ? " num" : "") +
    (className ? ` ${className}` : "");
  return (
    <th
      className={cls}
      aria-sort={ariaSort}
      onClick={() => onToggle(nextDirection(direction))}
      data-column={column}
    >
      {children}
      <span className="arrow" aria-hidden>
        {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
      </span>
    </th>
  );
}
