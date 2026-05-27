import * as React from "react";

/**
 * Phase 2.2 mgmt-01 — ArrivalCalendar.
 *
 * 7-day grid above the bookings table when the active view is "This
 * week" or no filter. Each day shows arrival + departure counts
 * with a small badge per booking type. Today is highlighted.
 */

export interface ArrivalCalendarDay {
  /** ISO YYYY-MM-DD. */
  date: string;
  /** Short weekday label (e.g. "Mon"). */
  weekday: string;
  /** Day number (1..31). */
  day: number;
  arrivals: number;
  departures: number;
  /** Mark this column as "today". */
  isToday?: boolean;
}

export interface ArrivalCalendarProps {
  days: ArrivalCalendarDay[];
  className?: string;
}

export function ArrivalCalendar({ days, className }: ArrivalCalendarProps) {
  return (
    <div className={`arrival-cal${className ? ` ${className}` : ""}`}>
      {days.map((d) => (
        <div key={d.date} className={`day${d.isToday ? " today" : ""}`}>
          <span className="weekday mono">{d.weekday}</span>
          <span className="num mono">{d.day}</span>
          <div className="counts">
            <span className="arr mono" title="Arrivals">↓ {d.arrivals}</span>
            <span className="dep mono" title="Departures">↑ {d.departures}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
