import * as React from "react";

/**
 * Phase 2.3 owner-03 — MaintenanceLog (read-only).
 *
 * Last N maintenance events on a villa. Each row: date + summary +
 * (optional) cost. Tickets marked `visible_to_owner = false` are
 * filtered upstream by the data resolver.
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
      {shown.map((e) => (
        <li key={e.id}>
          <span className="ml-date mono">{e.date}</span>
          <span className="ml-summary">{e.summary}</span>
          {e.status && <span className="ml-status mono">{e.status}</span>}
          {e.costUsd !== undefined && e.costUsd > 0 && (
            <span className="ml-cost mono">${e.costUsd.toLocaleString()}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
