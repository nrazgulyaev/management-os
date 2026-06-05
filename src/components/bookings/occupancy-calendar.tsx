import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import type { CalendarVillaRow } from "@/features/bookings/bookings-cabinet-queries";

/**
 * Occupancy calendar — villa × night grid (prototype `bookings.html`).
 * Bars are colour-coded by kind and link to the booking detail when a
 * `href` is present. Shared by the bookings list and the dedicated
 * `/bookings/calendar` route.
 */

const CAL_BAR: Record<string, { bg: string; fg: string }> = {
  confirmed: { bg: "#1f3a33", fg: "var(--cream-warm)" },
  hold: { bg: "var(--terra)", fg: "var(--cream-warm)" },
  owner: { bg: "var(--gold)", fg: "var(--ink)" },
};

export function OccupancyCalendar({
  timeline,
  nights = 14,
  heading = "Calendar",
}: {
  timeline: CalendarVillaRow[];
  nights?: number;
  heading?: string;
}) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startMs = today.getTime();
  const todayIso = new Date(startMs).toISOString().slice(0, 10);
  const days = Array.from({ length: nights }, (_, i) => {
    const d = new Date(startMs + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    return {
      iso,
      weekday: d
        .toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
        .slice(0, 2)
        .toUpperCase(),
      day: d.getUTCDate(),
      isToday: iso === todayIso,
    };
  });

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3.5">
        <h2 className="display text-[30px] font-normal m-0">
          {heading} <em className="text-[18px]">· next {nights} nights</em>
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
                    >
                      <div className="mono text-[9px] uppercase leading-none">{d.weekday}</div>
                      <div className="mono text-[11px] leading-tight mt-0.5">{d.day}</div>
                    </div>
                  ))}
                </div>
              </div>
              {timeline.map((v) => (
                <div
                  key={v.villaId}
                  className="grid grid-cols-[150px_1fr] border-b border-line-soft/60 last:border-0"
                >
                  <div className="px-3 py-2 min-w-0">
                    <div className="mono text-[12px] text-ink leading-tight">{v.villaCode}</div>
                    {v.villaName && (
                      <div className="text-[11px] text-ink-3 truncate">{v.villaName}</div>
                    )}
                  </div>
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
                              : undefined
                          }
                        />
                      ))}
                    </div>
                    {v.blocks.map((b) => {
                      const ciDay = Math.max(
                        0,
                        (new Date(b.checkIn + "T00:00:00Z").getTime() - startMs) / 86400000,
                      );
                      const coDay = Math.min(
                        nights,
                        (new Date(b.checkOut + "T00:00:00Z").getTime() - startMs) / 86400000,
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
                          title={`${b.label} — open booking`}
                          className={`${cls} cursor-pointer`}
                          style={style}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div key={b.id} title={b.label} className={cls} style={style}>
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mono text-[10.5px] text-ink-4 px-3 py-2.5 border-t border-line-soft">
              CLICK A BAR TO OPEN · <span className="text-terra">●</span> TODAY
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
