import * as React from "react";
import type { TicketPriority } from "@/features/maintenance/sla";

const LABEL: Record<TicketPriority, string> = {
  p0: "P0 · urgent",
  p1: "P1 · high",
  p2: "P2 · normal",
  p3: "P3 · low",
};

export interface PriorityBadgeProps {
  priority: TicketPriority;
  /** Compact variant — just "P0". */
  compact?: boolean;
  className?: string;
}

export function PriorityBadge({ priority, compact, className }: PriorityBadgeProps) {
  return (
    <span className={`priority-badge ${priority.toLowerCase()}${className ? ` ${className}` : ""}`}>
      {compact ? priority.toUpperCase() : LABEL[priority]}
    </span>
  );
}
