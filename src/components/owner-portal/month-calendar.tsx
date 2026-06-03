"use client";

import * as React from "react";

/**
 * Phase 2.3 owner-04 — MonthCalendar.
 *
 * 7-col month grid. Each day cell carries its own event pills (one per
 * active event that day), matching cc-handoff-bundle/cabinets/owner-p1/
 * 04-calendar.html. Multi-day events render a pill on every day they
 * span; the start day gets a "→", the end day a dashed underline.
 *
 * Tap a day → onDayClick(date) — used on mobile to open the day drawer.
 */

export type CalendarEventKind =
  | "guest"
  | "owner_request"
  | "owner_confirmed"
  | "turnover"
  | "block";

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  /** ISO YYYY-MM-DD inclusive */
  startDate: string;
  /** ISO YYYY-MM-DD inclusive */
  endDate: string;
  label?: string;
}

export interface MonthCalendarProps {
  /** "YYYY-MM" */
  month: string;
  events: CalendarEvent[];
  onDayClick?: (isoDate: string) => void;
  className?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1));
}
function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}
function isoOf(y: number, mIdx: number, day: number): string {
  return new Date(Date.UTC(y, mIdx, day)).toISOString().slice(0, 10);
}

interface DayEvent {
  ev: CalendarEvent;
  isStart: boolean;
  isEnd: boolean;
}

export function MonthCalendar({ month, events, onDayClick, className }: MonthCalendarProps) {
  const som = startOfMonth(month);
  const y = som.getUTCFullYear();
  const mIdx = som.getUTCMonth();
  const total = daysInMonth(som);
  const offset = (som.getUTCDay() + 6) % 7; // ISO week: Mon = 0
  const totalCells = Math.ceil((offset + total) / 7) * 7;

  // Bucket events onto each in-month day. ISO YYYY-MM-DD strings compare
  // lexically, so no Date math is needed for the overlap test.
  const byDay = React.useMemo(() => {
    const map = new Map<number, DayEvent[]>();
    for (const ev of events) {
      const start = ev.startDate;
      const end = ev.endDate < ev.startDate ? ev.startDate : ev.endDate;
      for (let day = 1; day <= total; day++) {
        const iso = isoOf(y, mIdx, day);
        if (iso >= start && iso <= end) {
          const arr = map.get(day) ?? [];
          arr.push({ ev, isStart: iso === start, isEnd: iso === end });
          map.set(day, arr);
        }
      }
    }
    return map;
  }, [events, total, y, mIdx]);

  return (
    <div className={`month-calendar${className ? ` ${className}` : ""}`}>
      <div className="mc-head">
        {WEEKDAYS.map((d) => (
          <div className="mc-weekday mono" key={d}>{d}</div>
        ))}
      </div>
      <div className="mc-grid">
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayNum = i - offset + 1;
          const inMonth = dayNum >= 1 && dayNum <= total;
          const iso = inMonth ? isoOf(y, mIdx, dayNum) : null;
          const dayEvents = inMonth ? byDay.get(dayNum) ?? [] : [];
          return (
            <button
              key={i}
              type="button"
              className={`mc-cell${inMonth ? "" : " mc-cell-out"}`}
              onClick={() => iso && onDayClick?.(iso)}
              disabled={!inMonth}
            >
              {inMonth && <span className="mc-day mono">{dayNum}</span>}
              {dayEvents.map(({ ev, isStart, isEnd }, j) => (
                <span
                  key={`${ev.id}-${j}`}
                  className={`mc-ev mc-ev-${ev.kind}${isEnd ? " is-end" : ""}`}
                  title={ev.label}
                >
                  {ev.label}
                  {isStart && !isEnd ? " →" : ""}
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
