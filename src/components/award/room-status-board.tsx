/**
 * Mega-Sprint Phase 8 — RoomStatusBoard primitive.
 *
 * Visual villa × day matrix, color-coded by per-day stay status
 * (vacant / arrival / staying / departure / blocked). Used by Front
 * Office (today's at-a-glance), Operations, and the Owner Portal
 * occupancy view. Pure SVG-free CSS grid — server component.
 *
 * Operators want a "board" view instead of three separate lists.
 * Each cell is a status pill; clicking the row's villa label drills
 * into the villa surface.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type RoomDayStatus =
  | "vacant"
  | "arrival"
  | "staying"
  | "departure"
  | "blocked";

const STATUS_STYLE: Record<
  RoomDayStatus,
  { bg: string; text: string; label: string; dot: string }
> = {
  vacant: {
    bg: "bg-canvas",
    text: "text-ink-tertiary",
    label: "Vacant",
    dot: "bg-line-strong",
  },
  arrival: {
    bg: "bg-success-weak",
    text: "text-success",
    label: "Arrival",
    dot: "bg-success",
  },
  staying: {
    bg: "bg-info-weak",
    text: "text-info",
    label: "Staying",
    dot: "bg-info",
  },
  departure: {
    bg: "bg-warning-weak",
    text: "text-warning",
    label: "Departure",
    dot: "bg-warning",
  },
  blocked: {
    bg: "bg-danger-weak",
    text: "text-danger",
    label: "Blocked",
    dot: "bg-danger",
  },
};

export interface RoomStatusRow {
  villaId: string;
  villaCode: string;
  /** Optional project / property label (rendered as a sub-line). */
  subtitle?: string;
  /**
   * Per-day status keyed by ISO date (YYYY-MM-DD). Days not present
   * default to "vacant".
   */
  days: Record<string, RoomDayStatus | undefined>;
  /** Optional click-through for the row label. */
  href?: string;
}

export interface RoomStatusBoardProps {
  /** ISO dates (YYYY-MM-DD) to render as columns, left → right. */
  dates: string[];
  rows: RoomStatusRow[];
  /** Optional heading rendered above the board. */
  heading?: React.ReactNode;
  /** Optional accessory rendered top-right of the header. */
  accessory?: React.ReactNode;
  /** Empty-state copy. */
  emptyMessage?: string;
  className?: string;
}

function dayHeader(iso: string): { day: string; weekday: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    day: String(d.getUTCDate()),
    weekday: d.toLocaleDateString("en-US", {
      weekday: "narrow",
      timeZone: "UTC",
    }),
  };
}

export function RoomStatusBoard({
  dates,
  rows,
  heading,
  accessory,
  emptyMessage,
  className,
}: RoomStatusBoardProps) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden",
        className,
      )}
      data-stage10="room-status-board"
    >
      {(heading || accessory) && (
        <header className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-b border-line-soft">
          {heading ? (
            typeof heading === "string" ? (
              <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink">
                {heading}
              </h3>
            ) : (
              heading
            )
          ) : (
            <span />
          )}
          {accessory && <div className="shrink-0">{accessory}</div>}
        </header>
      )}
      {rows.length === 0 ? (
        <p className="px-6 py-10 text-sm text-ink-tertiary text-center">
          {emptyMessage ?? "No villas yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-0 min-w-[640px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface px-4 py-3 text-left text-[10px] uppercase tracking-[0.16em] font-medium text-ink-tertiary border-b border-line-soft">
                  Villa
                </th>
                {dates.map((iso) => {
                  const h = dayHeader(iso);
                  return (
                    <th
                      key={iso}
                      className="px-1.5 py-3 text-center border-b border-line-soft min-w-[44px]"
                    >
                      <div className="text-[10px] uppercase tracking-[0.12em] text-ink-tertiary leading-none">
                        {h.weekday}
                      </div>
                      <div className="text-sm font-mono tabular-nums text-ink mt-0.5">
                        {h.day}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.villaId}>
                  <td className="sticky left-0 z-10 bg-surface px-4 py-2 border-b border-line-soft align-middle">
                    {row.href ? (
                      <Link
                        href={row.href}
                        className="flex flex-col gap-0.5 group"
                      >
                        <span className="font-mono text-xs text-ink group-hover:underline">
                          {row.villaCode}
                        </span>
                        {row.subtitle && (
                          <span className="text-[10px] text-ink-tertiary">
                            {row.subtitle}
                          </span>
                        )}
                      </Link>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs text-ink">
                          {row.villaCode}
                        </span>
                        {row.subtitle && (
                          <span className="text-[10px] text-ink-tertiary">
                            {row.subtitle}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  {dates.map((iso) => {
                    const status = row.days[iso] ?? "vacant";
                    const style = STATUS_STYLE[status];
                    return (
                      <td
                        key={iso}
                        className="px-1.5 py-2 border-b border-line-soft text-center align-middle"
                      >
                        <span
                          className={cn(
                            "inline-flex items-center justify-center rounded-full w-7 h-7",
                            style.bg,
                          )}
                          title={style.label}
                        >
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full",
                              style.dot,
                            )}
                            aria-hidden
                          />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="flex flex-wrap items-center gap-3 px-5 md:px-6 py-3 border-t border-line-soft text-[11px]">
            {(["vacant", "arrival", "staying", "departure", "blocked"] as RoomDayStatus[]).map(
              (s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 text-ink-tertiary"
                >
                  <span
                    className={cn("w-2 h-2 rounded-full", STATUS_STYLE[s].dot)}
                  />
                  {STATUS_STYLE[s].label}
                </span>
              ),
            )}
          </footer>
        </div>
      )}
    </section>
  );
}
