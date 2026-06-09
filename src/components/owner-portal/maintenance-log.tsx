import * as React from "react";

/**
 * Phase 2.3 owner-03 — MaintenanceLog (read-only).
 *
 * Last N maintenance events on a villa. Each entry renders as a soft
 * cream-warm card: a bold summary over a mono meta line that joins the
 * date · cost · status (matching cabinets/owner-p1/03-villas.html).
 * Tickets marked `visible_to_owner = false` are filtered upstream by
 * the data resolver.
 */

export interface MaintenanceEntry {
  id: string;
  date: string;
  summary: React.ReactNode;
  /** USD major. Hidden when 0. */
  costUsd?: number;
  /** "Resolved" / "Scheduled" / "In progress". */
  status?: string;
}

export interface MaintenanceLogProps {
  entries: MaintenanceEntry[];
  /** Cap (default 3 — owner only sees the most recent). */
  limit?: number;
  className?: string;
}

function fmtCost(usd: number): string {
  if (usd >= 1000) return `$${(usd / 1000).toFixed(usd >= 10000 ? 0 : 1)}K`;
  return `$${Math.round(usd)}`;
}

export function MaintenanceLog({ entries, limit = 3, className }: MaintenanceLogProps) {
  const shown = entries.slice(0, limit);
  if (shown.length === 0) {
    return (
      <div className={`maintenance-log empty${className ? ` ${className}` : ""}`}>
        No maintenance recently.
      </div>
    );
  }
  return (
    <ul className={`maintenance-log${className ? ` ${className}` : ""}`}>
      {shown.map((e) => {
        const meta = [
          e.date,
          e.costUsd !== undefined && e.costUsd > 0 ? fmtCost(e.costUsd) : null,
          e.status,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={e.id}>
            <span className="ml-summary">{e.summary}</span>
            {meta && <span className="ml-meta">{meta}</span>}
          </li>
        );
      })}
    </ul>
  );
}
