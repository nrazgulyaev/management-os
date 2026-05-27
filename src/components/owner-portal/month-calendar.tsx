"use client";

import * as React from "react";

/**
 * Phase 2.3 owner-04 — MonthCalendar.
 *
 * 7-col grid with color-encoded multi-day event bars. Server
 * pre-computes day strips (startCol/endCol/week) so the client
 * just renders absolute-positioned bars per week row.
 *
 * Tap a day → onDayClick(date) — used on mobile to open the
 * day-detail drawer.
 */

export type CalendarEventKind = "guest" | "owner_request" | "owner_confirmed" | "turnover";

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
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DayStrip {
  event: CalendarEvent;
  weekIdx: number;
  startCol: number;
  span: number;
  isStart: boolean;
  isEnd: boolean;
}

function computeStrips(month: string, events: CalendarEvent[]): DayStrip[] {
  const som = startOfMonth(month);
  const total = daysInMonth(som);
  // ISO week: Mon = 0
  const offset = (som.getUTCDay() + 6) % 7;
  const totalCells = Math.ceil((offset + total) / 7) * 7;

  function cellForDate(iso: string): number | null {
    const d = new Date(iso + "T00:00:00Z");
    if (d.getUTCFullYear() !== som.getUTCFullYear() || d.getUTCMonth() !== som.getUTCMonth()) {
      return null;
    }
    return offset + d.getUTCDate() - 1;
  }

  const strips: DayStrip[] = [];
  for (const ev of events) {
    const startCell = cellForDate(ev.startDate);
    const endCell = cellForDate(ev.endDate);
    if (startCell == null && endCell == null) continue;
    const s = startCell ?? 0;
    const e = endCell ?? totalCells - 1;
    let cursor = s;
    while (cursor <= e) {
      const weekIdx = Math.floor(cursor / 7);
      const weekEnd = Math.min((weekIdx + 1) * 7 - 1, e);
      strips.push({
        event: ev,
        weekIdx,
        startCol: cursor - weekIdx * 7,
        span: weekEnd - cursor + 1,
        isStart: cursor === s,
        isEnd: weekEnd === e,
      });
      cursor = weekEnd + 1;
    }
  }
  return strips;
}

export function MonthCalendar({ month, events, onDayClick, className }: MonthCalendarProps) {
  const som = startOfMonth(month);
  const total = daysInMonth(som);
  const offset = (som.getUTCDay() + 6) % 7;
  const totalCells = Math.ceil((offset + total) / 7) * 7;
  const weeks = totalCells / 7;
  const strips = React.useMemo(() => computeStrips(month, events), [month, events]);

  return (
    <div className={`month-calendar${className ? ` ${className}` : ""}`}>
      <div className="mc-head">
        {WEEKDAYS.map((d) => (
          <div className="mc-weekday mono" key={d}>{d}</div>
        ))}
      </div>
      <div className="mc-grid" style={{ gridTemplateRows: `repeat(${weeks}, minmax(96px, auto))` }}>
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayNum = i - offset + 1;
          const inMonth = dayNum >= 1 && dayNum <= total;
          const d = inMonth ? new Date(Date.UTC(som.getUTCFullYear(), som.getUTCMonth(), dayNum)) : null;
          const iso = d ? isoDate(d) : null;
          return (
            <button
              key={i}
              type="button"
              className={`mc-cell${inMonth ? "" : " mc-cell-out"}`}
              onClick={() => iso && onDayClick?.(iso)}
              disabled={!inMonth}
            >
              {inMonth && <span className="mc-day mono">{dayNum}</span>}
            </button>
          );
        })}
        {strips.map((s, i) => (
          <div
            key={i}
            className={`mc-strip mc-strip-${s.event.kind}${s.isStart ? " is-start" : ""}${s.isEnd ? " is-end" : ""}`}
            style={{
              gridRow: s.weekIdx + 1,
              gridColumn: `${s.startCol + 1} / span ${s.span}`,
            }}
            title={s.event.label}
          >
            {s.isStart && s.event.label}
          </div>
        ))}
      </div>
    </div>
  );
}
