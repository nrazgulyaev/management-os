"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import type {
  CalendarBlock,
  CalendarVillaRow,
} from "@/features/bookings/bookings-cabinet-queries";

/**
 * Occupancy calendar — villa × night grid (prototype
 * `cc-functional-handoff/cabinets/mgmt-p1/bookings-calendar.html`).
 *
 * BOOKINGS-CAL-PARITY-1: now a client component so booked bars can show a
 * cursor-following tooltip (guest · channel · dates · status) like the
 * mock. The window is driven by `startIso` + `nights` (the calendar route
 * computes them from `?range=` / `?start=`); with no `startIso` it keeps
 * the legacy "today + N nights" behaviour. Weekend columns get a soft
 * gold tint, today gets a terra tint + circled date, villa labels link to
 * the villa page and bars still link straight to the booking detail.
 */

const CAL_BAR: Record<string, { bg: string; fg: string }> = {
  confirmed: { bg: "var(--forest)", fg: "var(--cream-warm)" },
  hold: { bg: "var(--terra)", fg: "var(--cream-warm)" },
  owner: { bg: "var(--gold)", fg: "var(--ink)" },
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  tentative: "Hold / tentative",
  inquiry: "Inquiry",
  owner_stay: "Owner stay",
  hold: "Hold",
};

const DAY_MS = 86_400_000;
const TIP_W = 260;

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

interface TipState {
  x: number;
  y: number;
  block: CalendarBlock;
}

export function OccupancyCalendar({
  timeline,
  nights = 14,
  heading = "Calendar",
  startIso,
  rangeLabel,
}: {
  timeline: CalendarVillaRow[];
  nights?: number;
  heading?: string;
  /** Window start (ISO YYYY-MM-DD). Defaults to today — legacy behaviour. */
  startIso?: string;
  /** Heading suffix, e.g. "10 Jun – 9 Jul". Defaults to "next N nights". */
  rangeLabel?: string;
}) {
  const [tip, setTip] = React.useState<TipState | null>(null);

  const todayIso = new Date().toISOString().slice(0, 10);
  const windowStart = startIso ?? todayIso;
  const startMs = new Date(`${windowStart}T00:00:00Z`).getTime();
  const days = Array.from({ length: nights }, (_, i) => {
    const d = new Date(startMs + i * DAY_MS);
    const dow = d.getUTCDay();
    const iso = d.toISOString().slice(0, 10);
    return {
      iso,
      weekday: d
        .toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
        .slice(0, 2)
        .toUpperCase(),
      day: d.getUTCDate(),
      isToday: iso === todayIso,
      isWeekend: dow === 0 || dow === 6,
    };
  });

  const showTip = (e: React.MouseEvent, block: CalendarBlock) => {
    let x = e.clientX + 14;
    if (typeof window !== "undefined" && x + TIP_W > window.innerWidth) {
      x = e.clientX - TIP_W;
    }
    setTip({ x, y: e.clientY + 14, block });
  };
  const hideTip = () => setTip(null);

  const tipNights = tip
    ? Math.max(
        1,
        Math.round(
          (new Date(`${tip.block.checkOut}T00:00:00Z`).getTime() -
            new Date(`${tip.block.checkIn}T00:00:00Z`).getTime()) /
            DAY_MS,
        ),
      )
    : 0;
  const tipStatus = tip
    ? (STATUS_LABEL[tip.block.status ?? ""] ??
      (tip.block.kind === "owner"
        ? "Owner stay"
        : tip.block.kind === "hold"
          ? "Hold / tentative"
          : "Confirmed"))
    : "";

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3.5">
        <h2 className="display text-[30px] font-normal m-0">
          {heading}{" "}
          <em className="text-[18px]">· {rangeLabel ?? `next ${nights} nights`}</em>
        </h2>
        <div className="flex items-center gap-4 text-[11px] text-ink-3">
          {(["confirmed", "hold", "owner"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: CAL_BAR[k].bg }} />
              {k === "confirmed" ? "Confirmed" : k === "hold" ? "Hold / tentative" : "Owner stay"}
            </span>
          ))}
        </div>
      </div>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {timeline.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">No villas configured yet.</p>
        ) : (
          <div className="overflow-auto">
            <div style={{ minWidth: 150 + nights * 64 }}>
              <div className="grid grid-cols-[150px_1fr] border-b border-line-soft bg-cream-warm">
                <div className="mono text-[10px] uppercase tracking-wide text-ink-3 px-3 py-2.5 flex items-center">
                  Villa
                </div>
                <div className="grid" style={{ gridTemplateColumns: `repeat(${nights}, 1fr)` }}>
                  {days.map((d) => (
                    <div
                      key={d.iso}
                      className={`text-center py-1.5 ${d.isToday ? "text-terra" : "text-ink-3"}`}
                      style={
                        d.isWeekend && !d.isToday
                          ? { background: "color-mix(in oklab, var(--gold) 7%, transparent)" }
                          : undefined
                      }
                    >
                      <div className="mono text-[9px] uppercase leading-none">{d.weekday}</div>
                      <div
                        className={`mono text-[11px] leading-tight mt-0.5 ${
                          d.isToday
                            ? "inline-flex items-center justify-center min-w-[20px] h-[20px] rounded-full bg-terra text-ink-inverse font-medium"
                            : ""
                        }`}
                      >
                        {d.day}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {timeline.map((v) => (
                <div
                  key={v.villaId}
                  className="grid grid-cols-[150px_1fr] border-b border-line-soft/60 last:border-0"
                >
                  <Link
                    href={`/dashboard/villas/${v.villaId}`}
                    className="px-3 py-2 min-w-0 block hover:bg-cream-warm transition-colors"
                    title={`Open villa ${v.villaCode}`}
                  >
                    <div className="mono text-[12px] text-ink leading-tight">{v.villaCode}</div>
                    {v.villaName && (
                      <div className="text-[11px] text-ink-3 truncate">{v.villaName}</div>
                    )}
                  </Link>
                  <div className="relative min-h-[44px]">
                    <div
                      className="absolute inset-0 grid"
                      style={{ gridTemplateColumns: `repeat(${nights}, 1fr)` }}
                    >
                      {days.map((d) => (
                        <div
                          key={d.iso}
                          className="border-r border-line-soft/40"
                          style={
                            d.isToday
                              ? { background: "color-mix(in oklab, var(--terra) 5%, transparent)" }
                              : d.isWeekend
                                ? { background: "color-mix(in oklab, var(--gold) 5%, transparent)" }
                                : undefined
                          }
                        />
                      ))}
                    </div>
                    {v.blocks.map((b) => {
                      const ciDay = Math.max(
                        0,
                        (new Date(b.checkIn + "T00:00:00Z").getTime() - startMs) / DAY_MS,
                      );
                      const coDay = Math.min(
                        nights,
                        (new Date(b.checkOut + "T00:00:00Z").getTime() - startMs) / DAY_MS,
                      );
                      if (coDay <= 0 || ciDay >= nights) return null;
                      const color = CAL_BAR[b.kind] ?? CAL_BAR.confirmed;
                      const style = {
                        left: `calc(${(ciDay / nights) * 100}% + 3px)`,
                        width: `calc(${((coDay - ciDay) / nights) * 100}% - 6px)`,
                        background: color.bg,
                        color: color.fg,
                      };
                      const cls =
                        "absolute top-1/2 -translate-y-1/2 h-[24px] rounded-full text-[11px] flex items-center gap-1.5 px-2.5 overflow-hidden whitespace-nowrap transition-transform hover:scale-[1.02] hover:shadow-soft-card";
                      const inner = (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
                          <span className="truncate">{b.label}</span>
                        </>
                      );
                      return b.href ? (
                        <Link
                          key={b.id}
                          href={b.href}
                          className={`${cls} cursor-pointer`}
                          style={style}
                          onMouseMove={(e) => showTip(e, b)}
                          onMouseLeave={hideTip}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div
                          key={b.id}
                          className={cls}
                          style={style}
                          onMouseMove={(e) => showTip(e, b)}
                          onMouseLeave={hideTip}
                        >
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mono text-[10.5px] text-ink-4 px-3 py-2.5 border-t border-line-soft">
              HOVER A BAR FOR DETAILS · CLICK TO OPEN · <span className="text-terra">●</span> TODAY
            </div>
          </div>
        )}
      </Card>
      {tip && (
        <div
          className="fixed z-50 pointer-events-none rounded-[10px] bg-ink text-cream-warm px-3.5 py-2.5 max-w-[250px] shadow-soft-card"
          style={{ left: tip.x, top: tip.y }}
          role="tooltip"
        >
          <div className="display text-[15px] leading-snug">{tip.block.label}</div>
          {tip.block.code && (
            <div className="mono text-[10px] tracking-wide opacity-60 mt-0.5">
              {tip.block.code}
            </div>
          )}
          <div className="mono text-[10.5px] tracking-wide opacity-75 mt-1">
            {fmtDay(tip.block.checkIn)} → {fmtDay(tip.block.checkOut)} · {tipNights}{" "}
            {tipNights === 1 ? "night" : "nights"}
          </div>
          <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full mono text-[9.5px] uppercase tracking-wider bg-cream-warm/15">
            {tipStatus}
            {tip.block.channel ? ` · ${tip.block.channel}` : ""}
          </span>
        </div>
      )}
    </>
  );
}
