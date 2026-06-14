import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listBookingChannels } from "@/features/channels/services";
import { listGuests } from "@/features/guests/services";
import { BookingForm } from "./form";

export const metadata = { title: "New manual booking" };
export const dynamic = "force-dynamic";

export default async function NewBookingPage() {
  const [villas, channels, guests] = await Promise.all([
    listVillas(),
    listBookingChannels(),
    listGuests(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <span>New manual booking</span>
          </div>
          <h1>New manual booking</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Record a booking that arrived outside an OTA — direct, agent
            referral, or in-person request. Fees follow the channel default;
            override per booking when needed.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <BookingForm
        mode="create"
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        channels={channels.map((c) => ({ id: c.id, label: c.name, key: c.key }))}
        guests={guests.map((g) => ({ id: g.id, label: g.fullName }))}
      />
    </div>
  );
}
