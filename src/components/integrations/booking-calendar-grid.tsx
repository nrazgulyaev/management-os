/**
 * Lightweight calendar grid: rows = villa, columns = day. We deliberately
 * avoid a heavy calendar dependency — the grid is built from booking +
 * calendar-event date ranges and rendered as CSS spans. Read-only for v6.
 */
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";

export interface CalendarGridBooking {
  id: string;
  bookingCode: string;
  villaId: string;
  checkIn: string;
  checkOut: string;
  status: string;
  channelName: string | null;
  source: "manual" | "channel";
}

export interface CalendarGridVilla {
  id: string;
  unitCode: string;
  projectName: string;
}

const STATUS_TONE: Record<
  string,
  "neutral" | "warning" | "info" | "success" | "danger" | "accent"
> = {
  confirmed: "info",
  checked_in: "accent",
  checked_out: "neutral",
  tentative: "warning",
  inquiry: "warning",
  cancelled: "neutral",
  no_show: "danger",
};

export function BookingCalendarGrid({
  villas,
  bookings,
  startDate,
  days = 28,
}: {
  villas: CalendarGridVilla[];
  bookings: CalendarGridBooking[];
  startDate: string; // YYYY-MM-DD
  days?: number;
}) {
  const start = parseISO(startDate);
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
  const colTemplate = `220px repeat(${days}, minmax(28px, 1fr))`;

  return (
    <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
      {/* Header */}
      <div
        className="grid border-b border-line-soft bg-muted/30 text-[10px] uppercase tracking-widest text-ink-tertiary"
        style={{ gridTemplateColumns: colTemplate }}
      >
        <div className="px-3 py-2">Villa</div>
        {dayList.map((d) => (
          <div
            key={d.toISOString()}
            className="px-1 py-2 text-center font-mono tabular-nums"
            title={format(d, "yyyy-MM-dd")}
          >
            {format(d, "dd")}
          </div>
        ))}
      </div>

      {villas.length === 0 ? (
        <div className="p-6 text-sm text-ink-tertiary">No villas configured.</div>
      ) : (
        villas.map((v) => {
          const villaBookings = bookings.filter((b) => b.villaId === v.id);
          return (
            <div
              key={v.id}
              className="grid border-b border-line-soft last:border-0 relative"
              style={{ gridTemplateColumns: colTemplate, minHeight: "44px" }}
            >
              <div className="px-3 py-2 flex flex-col justify-center">
                <div className="text-sm text-ink font-medium">{v.unitCode}</div>
                <div className="text-[10px] text-ink-tertiary">{v.projectName}</div>
              </div>
              {dayList.map((d) => (
                <div key={d.toISOString()} className="border-l border-line-soft/40" />
              ))}
              {/* Booking spans rendered absolutely over the day cells. */}
              {villaBookings.map((b) => {
                const bIn = parseISO(b.checkIn);
                const bOut = parseISO(b.checkOut);
                const startCol = differenceInCalendarDays(bIn, start);
                const span = differenceInCalendarDays(bOut, bIn);
                if (startCol >= days || startCol + span <= 0) return null;
                const clampedStart = Math.max(0, startCol);
                const clampedEnd = Math.min(days, startCol + span);
                const length = clampedEnd - clampedStart;
                return (
                  <div
                    key={b.id}
                    className={`absolute top-1.5 bottom-1.5 rounded-sm flex items-center px-2 text-[11px] font-medium overflow-hidden border border-line-soft text-ink ${
                      b.source === "channel" ? "bg-gold-weak" : "bg-accent-weak"
                    }`}
                    title={`${b.bookingCode} · ${b.checkIn} → ${b.checkOut} · ${b.status}`}
                    style={{
                      left: `calc(220px + ((100% - 220px) / ${days}) * ${clampedStart})`,
                      width: `calc(((100% - 220px) / ${days}) * ${length} - 4px)`,
                    }}
                  >
                    <Badge tone={STATUS_TONE[b.status] ?? "neutral"} className="mr-2">
                      {b.source === "channel" ? "ch" : "dir"}
                    </Badge>
                    <span className="truncate">{b.bookingCode}</span>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
