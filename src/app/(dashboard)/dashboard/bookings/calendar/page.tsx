import Link from "next/link";
import { addDays, formatISO } from "date-fns";
import { asc, desc, eq, gte, lte, and } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Button } from "@/components/ui/button";
import { BookingCalendarGrid } from "@/components/integrations/booking-calendar-grid";
import { BookingAddButton } from "@/components/bookings/booking-add-button";
import { listBookingChannels } from "@/features/channels/services";
import { listGuests } from "@/features/guests/services";
import { getDb } from "@/lib/db/client";
import { bookings, bookingChannels } from "@/lib/db/schema/bookings";
import { villas, projects } from "@/lib/db/schema/projects";

export const metadata = { title: "Bookings · Calendar" };
export const dynamic = "force-dynamic";

export default async function BookingsCalendarPage() {
  const db = getDb();
  const today = new Date();
  const start = formatISO(addDays(today, -7), { representation: "date" });
  const end = formatISO(addDays(today, 28), { representation: "date" });

  let villaRows: { id: string; unitCode: string; projectName: string }[] = [];
  let bookingRows: {
    id: string;
    bookingCode: string;
    villaId: string;
    checkIn: string;
    checkOut: string;
    status: string;
    channelName: string | null;
    sourceReference: string | null;
  }[] = [];

  if (db) {
    villaRows = await db
      .select({
        id: villas.id,
        unitCode: villas.unitCode,
        projectName: projects.name,
      })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .orderBy(asc(projects.name), asc(villas.unitCode));

    bookingRows = await db
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        villaId: bookings.villaId,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        status: bookings.status,
        channelName: bookingChannels.name,
        sourceReference: bookings.sourceReference,
      })
      .from(bookings)
      .leftJoin(bookingChannels, eq(bookingChannels.id, bookings.channelId))
      .where(
        and(
          gte(bookings.checkOut, start),
          lte(bookings.checkIn, end),
        ),
      )
      .orderBy(desc(bookings.checkIn));
  }

  const grid = bookingRows.map((b) => ({
    id: b.id,
    bookingCode: b.bookingCode,
    villaId: b.villaId,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status,
    channelName: b.channelName,
    source: b.sourceReference ? ("channel" as const) : ("manual" as const),
  }));

  const [channelOpts, guestOpts] = await Promise.all([
    listBookingChannels(),
    listGuests(),
  ]);
  const villaOptions = villaRows.map((v) => ({
    id: v.id,
    label: `${v.unitCode} · ${v.projectName}`,
  }));
  const channelOptions = channelOpts.map((c) => ({
    id: c.id,
    label: c.name,
    key: c.key,
  }));
  const guestOptions = guestOpts.map((g) => ({ id: g.id, label: g.fullName }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Calendar" },
        ]}
        title="Booking calendar"
        description="Last week + next four weeks across every villa. Channel-imported bookings show in gold; manual bookings in accent."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href="/dashboard/bookings/sync">Sync feeds</Link>
            </Button>
            <BookingAddButton
              villas={villaOptions}
              channels={channelOptions}
              guests={guestOptions}
              label="New booking"
            />
          </div>
        }
      />
      <DbStatusNotice />
      <BookingCalendarGrid villas={villaRows} bookings={grid} startDate={start} days={35} />
      <p className="text-xs text-ink-tertiary">
        Hover a span to see booking code · status · dates. Click a row label to drill down (coming soon).
      </p>
    </div>
  );
}
