/**
 * P116B — Owner-safe visual calendar grid.
 *
 * Renders a month grid with horizontal event bars across day cells.
 * Owner-safe: never displays guest emails, phone numbers, lock codes,
 * provider IDs, or finance row IDs.
 *
 * Pure component — accepts already-projected events and a target
 * month.  No DB / env reads.  Server component (no hooks); navigation
 * uses plain `<Link>` URLs.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type OwnerCalendarEventKind =
  | "direct_booking"
  | "ota"
  | "owner_stay"
  | "maintenance"
  | "internal_hold"
  | "pending_direct_booking";

export interface OwnerCalendarEvent {
  id: string;
  kind: OwnerCalendarEventKind;
  /** Start date inclusive — YYYY-MM-DD. */
  startDate: string;
  /** End date exclusive — YYYY-MM-DD (i.e. day-of-checkout for stays). */
  endDate: string;
  /** Owner-safe label.  Never include email / phone / token / IDs. */
  label: string;
  /** Optional secondary label (e.g. channel + status). */
  sublabel?: string | null;
  /** Optional masked initials shown on the bar. */
  initials?: string | null;
}

export interface OwnerCalendarGridProps {
  /** Any date in the target month — only year/month is used. */
  monthDate: Date;
  /** Pre-built href for the previous-month nav arrow. */
  prevHref: string;
  /** Pre-built href for the next-month nav arrow. */
  nextHref: string;
  /** Events visible in this month. */
  events: OwnerCalendarEvent[];
  /** Optional villa label rendered in the header. */
  villaLabel?: string | null;
}

const KIND_STYLES: Record<
  OwnerCalendarEventKind,
  { bar: string; chip: string; label: string }
> = {
  direct_booking: {
    bar: "bg-accent-weak text-accent border border-accent/30",
    chip: "bg-accent text-ink-inverse",
    label: "Direct booking",
  },
  ota: {
    bar: "bg-info-weak text-info border border-info/30",
    chip: "bg-info text-ink-inverse",
    label: "OTA stay",
  },
  owner_stay: {
    bar: "bg-success-weak text-success border border-success/30",
    chip: "bg-success text-ink-inverse",
    label: "Owner stay",
  },
  maintenance: {
    bar: "bg-warning-weak text-warning border border-warning/30",
    chip: "bg-warning text-ink-inverse",
    label: "Maintenance",
  },
  internal_hold: {
    bar: "bg-muted text-ink-secondary border border-line-soft",
    chip: "bg-muted text-ink",
    label: "Internal hold",
  },
  pending_direct_booking: {
    bar: "bg-warning-weak/60 text-warning border border-dashed border-warning/40",
    chip: "bg-warning-weak text-warning",
    label: "Pending direct booking",
  },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfGrid(d: Date): Date {
  // Anchor on Monday.  In JS getUTCDay(): Sun=0, Mon=1 … Sat=6.
  const first = startOfMonth(d);
  const day = first.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - offset);
  return start;
}

function endOfMonth(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  );
}

function buildGrid(monthDate: Date): Date[] {
  const start = startOfGrid(monthDate);
  const end = endOfMonth(monthDate);
  const cells: Date[] = [];
  const cursor = new Date(start);
  // 6 weeks × 7 days max — pad to cover the entire month.
  while (cursor <= end || cells.length % 7 !== 0) {
    cells.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cells.length >= 42) break;
  }
  return cells;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface PositionedEvent {
  event: OwnerCalendarEvent;
  weekIndex: number;
  startCol: number;
  endCol: number; // inclusive
}

function positionEvents(
  events: OwnerCalendarEvent[],
  cells: Date[],
): PositionedEvent[] {
  if (cells.length === 0) return [];
  const gridStart = cells[0];
  const gridEnd = cells[cells.length - 1];
  const out: PositionedEvent[] = [];

  for (const e of events) {
    const eStart = new Date(`${e.startDate}T00:00:00Z`);
    const eEndExclusive = new Date(`${e.endDate}T00:00:00Z`);
    // Convert to inclusive last-occupied day.
    const eEndInclusive = new Date(eEndExclusive);
    eEndInclusive.setUTCDate(eEndInclusive.getUTCDate() - 1);

    if (eEndInclusive < gridStart) continue;
    if (eStart > gridEnd) continue;

    const clampedStart = eStart < gridStart ? gridStart : eStart;
    const clampedEnd = eEndInclusive > gridEnd ? gridEnd : eEndInclusive;

    let cursor = new Date(clampedStart);
    while (cursor <= clampedEnd) {
      const idx = Math.floor(
        (cursor.getTime() - gridStart.getTime()) / 86_400_000,
      );
      const weekIndex = Math.floor(idx / 7);
      const startCol = idx % 7;
      // Walk to the end of this week or the event end.
      let endCol = startCol;
      const walker = new Date(cursor);
      while (
        endCol < 6 &&
        new Date(walker.getTime() + 86_400_000).getTime() <=
          clampedEnd.getTime()
      ) {
        walker.setUTCDate(walker.getUTCDate() + 1);
        endCol += 1;
      }
      out.push({
        event: e,
        weekIndex,
        startCol,
        endCol,
      });
      const nextWeekStart = new Date(cursor);
      nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + (endCol - startCol + 1));
      cursor = nextWeekStart;
    }
  }
  return out;
}

export function OwnerCalendarGrid({
  monthDate,
  prevHref,
  nextHref,
  events,
  villaLabel,
}: OwnerCalendarGridProps) {
  const cells = buildGrid(monthDate);
  const monthIndex = monthDate.getUTCMonth();
  const positioned = positionEvents(events, cells);
  const weeks = Math.ceil(cells.length / 7);
  const todayStr = ymd(new Date());

  // Group events per week for absolute positioning across columns.
  const eventsByWeek: PositionedEvent[][] = Array.from(
    { length: weeks },
    () => [],
  );
  for (const p of positioned) eventsByWeek[p.weekIndex]?.push(p);

  return (
    <div className="flex flex-col gap-4" data-testid="owner-calendar-grid">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href={prevHref}
            aria-label="Previous month"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-line-soft bg-surface hover:border-line-strong"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h3 className="text-display text-[22px] md:text-[24px] font-medium text-ink">
            {monthLabel(monthDate)}
          </h3>
          <Link
            href={nextHref}
            aria-label="Next month"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-line-soft bg-surface hover:border-line-strong"
          >
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {villaLabel && (
          <span className="text-sm text-ink-secondary">{villaLabel}</span>
        )}
      </header>

      <div className="grid grid-cols-7 text-[10px] uppercase tracking-widest text-ink-tertiary">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5">
            {d}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: weeks }).map((_, w) => {
          const weekCells = cells.slice(w * 7, w * 7 + 7);
          const weekEvents = eventsByWeek[w];
          return (
            <div key={w} className="relative">
              <div className="grid grid-cols-7 gap-2">
                {weekCells.map((c, idx) => {
                  const inMonth = c.getUTCMonth() === monthIndex;
                  const dStr = ymd(c);
                  const isToday = dStr === todayStr;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "relative rounded-md border bg-surface min-h-[88px] p-2 text-xs flex flex-col",
                        inMonth
                          ? "border-line-soft"
                          : "border-line-soft/50 bg-surface/40 text-ink-tertiary",
                      )}
                    >
                      <span
                        className={cn(
                          "tabular-nums",
                          isToday
                            ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-ink text-ink-inverse text-[10px]"
                            : inMonth
                              ? "text-ink"
                              : "text-ink-tertiary",
                        )}
                      >
                        {c.getUTCDate()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Absolutely-positioned event bars per week. */}
              <div className="absolute inset-x-0 top-7 flex flex-col gap-1 px-0">
                {weekEvents.map((p, i) => {
                  const span = p.endCol - p.startCol + 1;
                  const totalCols = 7;
                  const widthPct = (span / totalCols) * 100;
                  const leftPct = (p.startCol / totalCols) * 100;
                  const styles = KIND_STYLES[p.event.kind];
                  return (
                    <div
                      key={`${p.event.id}-${p.weekIndex}-${p.startCol}-${i}`}
                      className={cn(
                        "rounded-md text-[11px] px-2 py-1 truncate flex items-center gap-1.5",
                        styles.bar,
                      )}
                      style={{
                        position: "absolute",
                        top: `${i * 22}px`,
                        left: `calc(${leftPct}% + 4px)`,
                        width: `calc(${widthPct}% - 8px)`,
                      }}
                      title={`${styles.label} · ${p.event.label}`}
                      data-event-kind={p.event.kind}
                    >
                      {p.event.initials && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-ink/10 text-ink text-[9px] tracking-tight shrink-0">
                          {p.event.initials}
                        </span>
                      )}
                      <span className="truncate">{p.event.label}</span>
                      {p.event.sublabel && (
                        <span className="text-[10px] opacity-80 hidden sm:inline">
                          · {p.event.sublabel}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="flex flex-wrap items-center gap-3 text-[11px] text-ink-tertiary">
        <span className="text-label">Legend:</span>
        {(
          [
            "direct_booking",
            "ota",
            "owner_stay",
            "maintenance",
            "internal_hold",
            "pending_direct_booking",
          ] as OwnerCalendarEventKind[]
        ).map((k) => (
          <span
            key={k}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest",
              KIND_STYLES[k].bar,
            )}
          >
            {KIND_STYLES[k].label}
          </span>
        ))}
      </footer>
    </div>
  );
}
