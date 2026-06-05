import Link from "next/link";
import { getNext14NightsTimeline } from "@/features/bookings/bookings-cabinet-queries";
import { OccupancyCalendar } from "@/components/bookings/occupancy-calendar";
import { BookingAddButton } from "@/components/bookings/booking-add-button";
import { listVillas } from "@/features/villas/services";
import { listBookingChannels } from "@/features/channels/services";
import { listGuests } from "@/features/guests/services";

/**
 * Bookings · Calendar — the redesigned occupancy grid (villa × night) on the
 * cabinet design system. Replaces the legacy BookingCalendarGrid. Bars link
 * straight to the booking detail. Shows a 30-night window.
 */

export const metadata = { title: "Bookings · Calendar" };
export const dynamic = "force-dynamic";

const NIGHTS = 30;

export default async function BookingsCalendarPage() {
  const [timeline, villaList, channelList, guestList] = await Promise.all([
    getNext14NightsTimeline(undefined, NIGHTS).catch(() => []),
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

      <div className="mt-[18px]">
        <OccupancyCalendar timeline={timeline} nights={NIGHTS} heading="Occupancy" />
      </div>
    </>
  );
}
