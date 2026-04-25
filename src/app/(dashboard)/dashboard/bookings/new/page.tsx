import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listBookingChannels } from "@/features/channels/services";
import { listGuests } from "@/features/guests/services";
import { BookingForm } from "./form";

export const metadata = { title: "New manual booking" };

export default async function NewBookingPage() {
  const [villas, channels, guests] = await Promise.all([
    listVillas(),
    listBookingChannels(),
    listGuests(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "New manual booking" },
        ]}
        title="New manual booking"
        description="Record a booking that arrived outside an OTA — direct, agent referral, or in-person request. Fees follow the channel default; override per booking when needed."
      />
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
