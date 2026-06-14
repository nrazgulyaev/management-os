import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import { CalendarBlockForm } from "@/components/availability/calendar-block-form";

export const metadata = { title: "New calendar block" };
export const dynamic = "force-dynamic";

export default async function NewBlockPage() {
  const villaList = await listVillas();
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/availability">Availability</Link> /{" "}
            <Link href="/dashboard/availability/blocks">Calendar blocks</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New calendar block</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Manual blocks for maintenance, deep clean, OOO, internal hold, or
            owner-stay placeholder. Booking-sourced blocks come from the booking
            itself.
          </p>
        </div>
      </div>
      <CalendarBlockForm
        villas={villaList.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
      />
    </div>
  );
}
