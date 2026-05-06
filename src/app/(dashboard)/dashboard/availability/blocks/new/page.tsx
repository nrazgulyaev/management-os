import { PageHeader } from "@/components/ui/page-header";
import { listVillas } from "@/features/villas/services";
import { CalendarBlockForm } from "@/components/availability/calendar-block-form";

export const metadata = { title: "New calendar block" };
export const dynamic = "force-dynamic";

export default async function NewBlockPage() {
  const villaList = await listVillas();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Availability", href: "/dashboard/availability" },
          { label: "Calendar blocks", href: "/dashboard/availability/blocks" },
          { label: "New" },
        ]}
        title="New calendar block"
        description="Manual blocks for maintenance, deep clean, OOO, internal hold, or owner-stay placeholder. Booking-sourced blocks come from the booking itself."
      />
      <CalendarBlockForm
        villas={villaList.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
      />
    </div>
  );
}
