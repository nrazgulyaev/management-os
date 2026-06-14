import { notFound } from "next/navigation";
import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { BookingForm } from "@/features/bookings/form";
import { getBookingById, listBookings } from "@/features/bookings/services";
import { listVillas } from "@/features/villas/services";
import { listBookingChannels } from "@/features/channels/services";
import { listGuests } from "@/features/guests/services";

export const metadata = { title: "Edit booking" };
export const dynamic = "force-dynamic";

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [b, villas, channels, guests] = await Promise.all([
    getBookingById(id),
    listVillas(),
    listBookingChannels(),
    listGuests(),
  ]);
  if (!b) {
    // Touch listBookings to keep service stable in mock-only mode (no-op cost)
    await listBookings();
    notFound();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <Link href={`/dashboard/bookings/${b.id}`}>{b.bookingCode}</Link> /{" "}
            <span>Edit</span>
          </div>
          <h1>{`Edit · ${b.bookingCode}`}</h1>
        </div>
      </div>
      <DbStatusNotice />
      <BookingForm
        mode="edit"
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        channels={channels.map((c) => ({ id: c.id, label: c.name, key: c.key }))}
        guests={guests.map((g) => ({ id: g.id, label: g.fullName }))}
        defaults={{
          id: b.id,
          villaId: b.villaId,
          channelId: null,
          guestId: null,
          bookingCode: b.bookingCode,
          sourceReference: null,
          status: b.status,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          currency: b.currency,
          grossAmount: b.grossAmount,
          cleaningFeeAmount: b.cleaningFeeAmount,
          channelFeeAmount: b.channelFeeAmount,
          paymentFeeAmount: b.paymentFeeAmount,
          notes: null,
        }}
        cancelHref={`/dashboard/bookings/${b.id}`}
      />
    </div>
  );
}
