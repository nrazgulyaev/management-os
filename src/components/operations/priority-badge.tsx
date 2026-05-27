import * as React from "react";
import type { TicketPriority } from "@/features/maintenance/sla";

const LABEL: Record<TicketPriority, string> = {
  P0: "P0 · urgent",
  P1: "P1 · high",
  P2: "P2 · normal",
  P3: "P3 · low",
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
      {compact ? priority : LABEL[priority]}
    </span>
  );
}
