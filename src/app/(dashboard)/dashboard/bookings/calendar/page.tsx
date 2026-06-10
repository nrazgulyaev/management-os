import Link from "next/link";
import { getNext14NightsTimeline } from "@/features/bookings/bookings-cabinet-queries";
import { OccupancyCalendar } from "@/components/bookings/occupancy-calendar";
import { BookingAddButton } from "@/components/bookings/booking-add-button";
import { listVillas } from "@/features/villas/services";
import { listBookingChannels } from "@/features/channels/services";
import { listGuests } from "@/features/guests/services";

/**
 * Bookings · Calendar — the redesigned occupancy grid (villa × night) on the
 * cabinet design system, brought to parity with the mgmt-p1 prototype
 * (`bookings-calendar.html`).
 *
 * BOOKINGS-CAL-PARITY-1: the window is searchParams-driven —
 *   ?range=7|14|30|month   visible window length (month = calendar month)
 *   ?start=YYYY-MM-DD      window anchor (month mode uses its month)
 * Range chips + Prev / Today / Next are plain links computed server-side.
 * No params keeps the legacy today + 30-nights window, so existing links
 * keep working. Bars link straight to the booking detail and show a hover
 * tooltip (guest · channel · dates · status).
 */

export const metadata = { title: "Bookings · Calendar" };
export const dynamic = "force-dynamic";

type RangeKey = "7" | "14" | "30" | "month";
const RANGE_KEYS: RangeKey[] = ["7", "14", "30", "month"];
const RANGE_LABELS: Record<RangeKey, string> = {
  "7": "7 nights",
  "14": "14 nights",
  "30": "30 nights",
  month: "Month",
};

const DAY_MS = 86_400_000;
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const parseIso = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const addDays = (iso: string, n: number) =>
  isoOf(new Date(parseIso(iso).getTime() + n * DAY_MS));
const fmtShort = (iso: string) =>
  parseIso(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

function calendarHref(range: RangeKey, start?: string): string {
  return `/dashboard/bookings/calendar?range=${range}${start ? `&start=${start}` : ""}`;
}

export default async function BookingsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string }>;
}) {
  const sp = await searchParams;
  const range: RangeKey = RANGE_KEYS.includes(sp.range as RangeKey)
    ? (sp.range as RangeKey)
    : "30";
  const todayIso = isoOf(new Date());
  const startParam =
    sp.start &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.start) &&
    !Number.isNaN(parseIso(sp.start).getTime())
      ? sp.start
      : undefined;
  const anchor = startParam ?? todayIso;

  // Resolve the visible window.
  let windowStart: string;
  let nights: number;
  let label: string;
  let prevHref: string;
  let nextHref: string;
  if (range === "month") {
    const a = parseIso(anchor);
    const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
    const nextFirst = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1));
    const prevFirst = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - 1, 1));
    windowStart = isoOf(first);
    nights = Math.round((nextFirst.getTime() - first.getTime()) / DAY_MS);
    label = first.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    prevHref = calendarHref("month", isoOf(prevFirst));
    nextHref = calendarHref("month", isoOf(nextFirst));
  } else {
    nights = Number(range);
    windowStart = anchor;
    label = `${fmtShort(windowStart)} – ${fmtShort(addDays(windowStart, nights - 1))}`;
    prevHref = calendarHref(range, addDays(windowStart, -nights));
    nextHref = calendarHref(range, addDays(windowStart, nights));
  }
  // "Today" drops the anchor → defaults back to today / the current month.
  const todayHref = calendarHref(range);

  const [timeline, villaList, channelList, guestList] = await Promise.all([
    getNext14NightsTimeline(windowStart, nights).catch(() => []),
    listVillas().catch(() => []),
    listBookingChannels().catch(() => []),
    listGuests().catch(() => []),
  ]);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/bookings">Bookings</Link> / <span>Calendar</span>
          </div>
          <h1>Calendar</h1>
        </div>
        <div className="actions">
          <Link href="/dashboard/bookings" className="btn btn-secondary btn-sm">
            ← List
          </Link>
          <Link href="/dashboard/bookings/new-by-type" className="btn btn-secondary btn-sm">
            Book by type
          </Link>
          <BookingAddButton
            villas={villaList.map((v) => ({
              id: v.id,
              label: `${v.unitCode} · ${v.projectName}`,
            }))}
            channels={channelList.map((c) => ({ id: c.id, label: c.name, key: c.key }))}
            guests={guestList.map((g) => ({ id: g.id, label: g.fullName }))}
            label="New booking"
          />
        </div>
      </div>

      <div className="mt-[18px] flex items-center gap-4 flex-wrap">
        <div className="inline-flex items-center gap-0.5 bg-cream-deep border border-line rounded-[10px] p-[3px]">
          {RANGE_KEYS.map((r) => (
            <Link
              key={r}
              href={calendarHref(r, startParam)}
              className={`px-3.5 py-1.5 rounded-[7px] text-[13px] font-medium transition-colors ${
                r === range
                  ? "bg-paper text-ink shadow-soft-card"
                  : "text-ink-3 hover:text-ink"
              }`}
              aria-current={r === range ? "page" : undefined}
            >
              {RANGE_LABELS[r]}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link href={prevHref} className="btn btn-ghost btn-sm" aria-label="Previous window">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[15px] h-[15px]"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <span className="display text-[18px] text-ink min-w-[190px] text-center">
            {label}
            {range !== "month" && <em className="text-terra text-[15px] ml-1">· {nights}n</em>}
          </span>
          <Link href={nextHref} className="btn btn-ghost btn-sm" aria-label="Next window">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[15px] h-[15px]"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
          <Link href={todayHref} className="btn btn-ghost btn-sm">
            Today
          </Link>
        </div>
      </div>

      <div className="mt-[14px]">
        <OccupancyCalendar
          timeline={timeline}
          nights={nights}
          startIso={windowStart}
          heading="Occupancy"
          rangeLabel={range === "month" ? label : `${label} · ${nights} nights`}
        />
      </div>
    </>
  );
}
