import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { requirePermission } from "@/features/auth/permissions";
import { listVillas } from "@/features/villas/services";
import { CreateDirectBookingForm } from "./form";

export const metadata = { title: "New direct booking" };
export const dynamic = "force-dynamic";

export default async function NewDirectBookingPage() {
  await requirePermission("direct_booking.write");
  const villas = await listVillas();
  const options = villas.map((v) => ({
    id: v.id,
    label: `${v.unitCode}${v.name ? ` · ${v.name}` : ""} — ${v.projectName}`,
  }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Holds", href: "/dashboard/direct-bookings/holds" },
          { label: "New" },
        ]}
        title="New direct booking"
        description="Place a commission-free hold for a guest who reached you off-platform (phone, WhatsApp, walk-in). The dates are priced live and blocked across every channel — no card is charged."
      />
      <DbStatusNotice />
      <CreateDirectBookingForm villas={options} />
    </div>
  );
}
